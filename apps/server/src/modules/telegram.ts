import type { Update } from 'grammy/types';
import type { OutboxEvent, Signal } from '@memecoin/contracts';
import { DeliveryError } from '../adapters/telegram.ts';
import type { TelegramMessage, TelegramTransport } from '../adapters/telegram.ts';
import type { Services } from './services.ts';
import { AppError } from './settings.ts';

interface Callback { id: string; action: 'ENTRY' | 'CLOSE' | 'CONFIRM'; entityId: string; portfolioId: string; version: string; expiresAt: string }
export class TelegramService {
  readonly services: Services; readonly transport: TelegramTransport; readonly chatId: string; readonly userId: string;
  private controller: AbortController | undefined; private polling?: Promise<void>; private delivering = false;
  lastPollError = false;
  constructor(services: Services, transport: TelegramTransport, chatId: string, userId: string) { this.services = services; this.transport = transport; this.chatId = chatId; this.userId = userId; }
  private get store() { return this.services.store; }
  health() { return this.store.list<OutboxEvent>('outbox', "state='DELIVERY_UNKNOWN'").some((r) => r.channel === 'telegram') ? 'delivery_unknown' : this.lastPollError ? 'unavailable' : this.controller ? 'running' : 'stopped'; }
  private manual() { const portfolios = this.services.settings.portfolios(); return portfolios.find((p) => p.mode === 'manual' && p.experimentId === this.services.settings.activeExperiment()) ?? portfolios.filter((p) => p.mode === 'manual').at(-1); }
  private callback(action: Callback['action'], entityId: string, portfolioId: string, version: string, expiresAt: string) {
    const row: Callback = { id: this.store.id(), action, entityId, portfolioId, version, expiresAt }; this.store.put('telegram_callbacks', row, {}, true); return row.id;
  }
  signalMessage(signal: Signal): TelegramMessage {
    const portfolio = this.manual(), preview = portfolio ? this.services.risk.preview(signal.id, portfolio.id) : null;
    const text = `SIMULASI — ${signal.token.symbol ?? 'Token'}\nMint: ${signal.token.mint}\nEntry USD ${signal.entry.lowUsd}–${signal.entry.highUsd}; stop ${signal.entry.stopUsd}\nBerlaku: ${signal.expiresAt}\nRisiko: ${preview?.plannedLossIdr ?? 'belum tersedia'} IDR; nominal manual: ${preview?.entryCostIdr ?? 'belum tersedia'} IDR\n${signal.scenarios.bullish}\n${signal.scenarios.bearish}\nSecurity ${signal.security.status}; pemeriksaan terbatas.\nDetail ID: ${signal.id}\nDashboard localhost hanya dapat dibuka di PC aplikasi.`;
    return { text, expiresAt: signal.expiresAt, signalId: signal.id, ...(portfolio && preview?.allowed ? { buttons: [[{ text: 'Simulasikan entry manual', callback_data: this.callback('ENTRY', signal.id, portfolio.id, signal.configHash, signal.expiresAt) }]] } : {}) };
  }
  private enqueue(key: string, message: TelegramMessage) {
    if (this.store.list('outbox', 'dedupe_key=?', [key]).length) return;
    const row: OutboxEvent = { id: this.store.id(), eventId: key, channel: 'telegram', dedupeKey: key, payload: { message }, state: 'PENDING', attemptCount: 0, nextAttemptAt: this.store.now(), deliveredAt: null, externalMessageId: null }; this.save(row);
  }
  private save(row: OutboxEvent) { this.store.put('outbox', row, { dedupe_key: row.dedupeKey, state: row.state, next_attempt_at: row.nextAttemptAt }); }
  private command(text: string): TelegramMessage {
    const command = text.split(/\s/)[0]?.split('@')[0];
    if (command === '/signals') {
      const signal = this.services.signals.list().find((s) => s.state === 'VALID'); return signal ? this.signalMessage(signal) : { text: 'SIMULASI: belum ada sinyal valid. Tidak ada kewajiban entry.' };
    }
    if (command === '/status') return { text: `SIMULASI\n${this.services.settings.portfolios().map((p) => `${p.mode} ${p.id}: ekuitas ${this.services.risk.valuation(p.id).equityIdr ?? 'UNPRICED'} IDR`).join('\n') || 'Buat eksperimen di dashboard PC.'}\nMarket: ${this.services.health().providers}\nTanpa pemantauan saat PC mati.` };
    if (command === '/positions') {
      const positions = this.services.paper.list().filter((p) => p.state !== 'CLOSED').slice(0, 10);
      return { text: `SIMULASI\n${positions.map((p) => `${p.mint}\n${p.state} / ${this.services.risk.portfolio(p.portfolioId).mode}\nStop ${p.stopPrice}; target ${p.targetPrice}; ID ${p.id}`).join('\n') || 'Tidak ada posisi aktif.'}`, buttons: positions.filter((p) => this.services.risk.portfolio(p.portfolioId).mode === 'manual').map((p) => [{ text: `Tutup ${p.mint.slice(0, 8)}`, callback_data: this.callback('CLOSE', p.id, p.portfolioId, p.configRefs.strategy, new Date(this.store.clock.now().getTime() + 120_000).toISOString()) }]) };
    }
    return { text: 'SIMULASI, tanpa wallet atau transaksi nyata.\n/status — ekuitas terpisah\n/signals — sinyal terbaru dan preview\n/positions — posisi aktif dan konfirmasi exit manual\n/help — bantuan\nDetail lengkap tersedia sebagai teks. Dashboard localhost hanya di PC aplikasi.' };
  }
  private execute(id: string): TelegramMessage {
    const row = this.store.get<Callback>('telegram_callbacks', id);
    if (!row || row.expiresAt <= this.store.now()) return { text: 'Tombol tidak valid atau kedaluwarsa. Muat perintah terbaru.' };
    if (this.services.risk.portfolio(row.portfolioId).mode !== 'manual') return { text: 'Aksi Telegram hanya untuk portfolio manual.' };
    if (row.action === 'ENTRY') {
      const signal = this.services.signals.get(row.entityId);
      if (signal.configHash !== row.version || signal.state !== 'VALID') return { text: 'Versi atau state sinyal berubah. Entry ditolak.' };
      const entry = this.services.paper.request(signal.id, row.portfolioId, `telegram:${row.id}`, 'telegram');
      return { text: `SIMULASI ${entry.state}. ${entry.reasonCodes.join(', ')} Menunggu observasi berikutnya jika PENDING. ID ${entry.id}` };
    }
    const position = this.services.paper.position(row.entityId);
    if (position.portfolioId !== row.portfolioId || position.configRefs.strategy !== row.version || position.state === 'CLOSED') return { text: 'Posisi sudah ditutup atau versinya berubah.' };
    if (row.action === 'CLOSE') return { text: `Konfirmasi tutup SIMULASI ${position.mint}? Fill menunggu observasi valid berikutnya.`, buttons: [[{ text: 'Konfirmasi exit', callback_data: this.callback('CONFIRM', position.id, row.portfolioId, row.version, row.expiresAt) }]] };
    this.services.paper.requestClose(position.id, `telegram:${row.id}`, true); return { text: 'SIMULASI: exit intent tersimpan. Menunggu observasi valid berikutnya.' };
  }
  async handle(update: Update) {
    const callback = update.callback_query, message = update.message ?? callback?.message;
    const allowed = String(message?.chat.id) === this.chatId && String((callback?.from ?? update.message?.from)?.id) === this.userId;
    this.store.transaction(() => {
      const checkpoint = this.store.get<{ id: string; updateId: number }>('job_state', 'telegram-checkpoint');
      if (checkpoint && update.update_id <= checkpoint.updateId) return;
      if (allowed) {
        let response: TelegramMessage;
        try { response = callback ? this.execute(callback.data ?? '') : this.command(update.message?.text ?? '/help'); }
        catch (error) { response = { text: error instanceof AppError ? error.message : 'Aksi ditolak. Muat data terbaru di dashboard.' }; }
        this.enqueue(`telegram:update:${update.update_id}`, response);
      }
      this.store.put('job_state', { id: 'telegram-checkpoint', updateId: update.update_id });
    });
    this.services.events.flush();
    if (allowed && callback) await this.transport.acknowledge(callback.id);
  }
  recover() { for (const row of this.store.list<OutboxEvent>('outbox', "state='SENDING'")) if (row.channel === 'telegram') this.save({ ...row, state: 'DELIVERY_UNKNOWN' }); }
  healthAlert() {
    const state = this.services.health().providers, old = this.store.get<{ state: string; sentAt: string }>('job_state', 'telegram-health');
    if (old?.state === state || (old && this.store.clock.now().getTime() - Date.parse(old.sentAt) < 900_000)) return;
    this.store.transaction(() => {
      this.store.put('job_state', { id: 'telegram-health', state, sentAt: this.store.now() });
      if (state !== 'idle') this.enqueue(`telegram:health:${this.store.now()}`, { text: `SIMULASI: kondisi market ${state}. Entry mengikuti gate kesegaran dan keamanan; tidak ada pemantauan saat PC mati.` });
    });
  }
  private chatBlockedUntil(): number {
    const row = this.store.get<{ until: string }>('job_state', 'telegram-chat-block');
    return row ? Date.parse(row.until) : 0;
  }
  private blockChat(seconds: number) {
    this.store.put('job_state', { id: 'telegram-chat-block', until: new Date(this.store.clock.now().getTime() + seconds * 1000).toISOString() });
  }
  async deliver() {
    if (this.delivering) return; this.delivering = true;
    try {
      if (this.store.clock.now().getTime() < this.chatBlockedUntil()) return;
      const rows = this.store.list<OutboxEvent>('outbox', "state IN ('PENDING','RETRY') AND next_attempt_at<=?", [this.store.now()]).filter((r) => r.channel === 'telegram').slice(0, 5);
      for (const row of rows) {
        if (this.store.clock.now().getTime() < this.chatBlockedUntil()) break;
        let message = row.payload.message as TelegramMessage | undefined;
        if (!message && row.payload.type === 'signal.created') {
          const signal = this.services.signals.get(String(row.payload.entityId));
          if (signal.state === 'VALID') message = this.signalMessage(signal);
        } else if (!message && row.payload.type === 'position.updated') {
          const position = this.services.paper.position(String(row.payload.entityId)); message = { text: `SIMULASI ${position.state}\n${position.mint}\nPortfolio ${this.services.risk.portfolio(position.portfolioId).mode}\nNet PnL ${position.pnlIdr ?? 'belum direalisasi'} IDR\nAlasan ${position.exitReason ?? '—'}\nID ${position.id}` };
        }
        if (message?.signalId) {
          const signal = this.services.signals.get(message.signalId);
          if (!signal || signal.state !== 'VALID' || signal.expiresAt <= this.store.now()) { this.save({ ...row, state: 'DEAD' }); continue; }
          message = this.signalMessage(signal);
        }
        if (!message || (message.expiresAt && message.expiresAt <= this.store.now())) { this.save({ ...row, state: 'DEAD' }); continue; }
        const sending = { ...row, state: 'SENDING' as const, attemptCount: row.attemptCount + 1 }; this.save(sending);
        try { const externalMessageId = await this.transport.send(this.chatId, message); this.save({ ...sending, state: 'DELIVERED', deliveredAt: this.store.now(), externalMessageId, payload: { ...row.payload, message } }); }
        catch (error) { const failure = error instanceof DeliveryError ? error : new DeliveryError('DELIVERY_UNKNOWN'); if (failure.kind === 'RETRY') this.blockChat(failure.retrySeconds); this.save({ ...sending, state: failure.kind === 'RETRY' && sending.attemptCount >= 5 ? 'DEAD' : failure.kind, nextAttemptAt: new Date(this.store.clock.now().getTime() + failure.retrySeconds * 1000).toISOString() }); if (failure.kind === 'RETRY') break; }
      }
    } finally { this.delivering = false; }
  }
  start() {
    if (this.controller) return; this.controller = new AbortController(); this.recover(); const signal = this.controller.signal;
    this.polling = (async () => {
      while (!signal.aborted) {
        try {
          const checkpoint = this.store.get<{ updateId: number }>('job_state', 'telegram-checkpoint');
          const updates = await this.transport.poll((checkpoint?.updateId ?? -1) + 1, signal); this.lastPollError = false;
          for (const update of updates.sort((a, b) => a.update_id - b.update_id)) { if (signal.aborted) break; await this.handle(update); }
        } catch { this.lastPollError = true; if (!signal.aborted) await new Promise<void>((resolve) => { const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); }; const timer = setTimeout(finish, 5000); signal.addEventListener('abort', finish, { once: true }); }); }
      }
    })();
  }
  async stop() { this.controller?.abort(); await this.polling; this.controller = undefined; this.transport.close?.(); }
}
