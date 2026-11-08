import { D, buyCost, ema, sellProceeds } from '@memecoin/domain';
import { z } from 'zod';
import { entryRequestSchema, positionSchema } from '@memecoin/contracts';
import type { DataGap, Decision, EntryRequest, EquitySnapshot, ExitIntent, Fill, LedgerEntry, Portfolio, Position, Signal, Snapshot } from '@memecoin/contracts';
import { Store, hash } from '../db/store.ts';
import { AppError, SettingsService } from './settings.ts';
import { RiskService } from './risk.ts';
import { SignalService } from './signals.ts';
import { MarketService } from './market.ts';
import { SecurityService } from './security.ts';
import { Events } from './events.ts';

interface IdempotencyRecord { id: string; scope: string; key: string; payloadHash: string; resultId: string }
export class PaperService {
  readonly store: Store; readonly settings: SettingsService; readonly risk: RiskService; readonly signals: SignalService; readonly market: MarketService; readonly security: SecurityService; readonly events: Events;
  accepting = true;
  constructor(store: Store, settings: SettingsService, risk: RiskService, signals: SignalService, market: MarketService, security: SecurityService, events: Events) { this.store = store; this.settings = settings; this.risk = risk; this.signals = signals; this.market = market; this.security = security; this.events = events; }
  private idempotent<T extends { id: string }>(scope: string, key: string, payload: unknown, lookup: (id: string) => T, action: () => T): T {
    z.string().min(1).max(120).regex(/^[\w:.-]+$/).parse(key);
    return this.store.transaction(() => {
      const payloadHash = hash(payload), old = this.store.list<IdempotencyRecord>('idempotency', 'scope=? AND request_key=?', [scope, key])[0];
      if (old) { if (old.payloadHash !== payloadHash) throw new AppError(409, 'CONFLICT', 'Idempotency-Key sudah dipakai untuk payload berbeda.'); return lookup(old.resultId); }
      const result = action(), record = { id: this.store.id(), scope, key, payloadHash, resultId: result.id };
      this.store.put('idempotency', record, { scope, request_key: key, payload_hash: payloadHash }, true); return result;
    });
  }
  entry(id: string) { const entry = this.store.get<EntryRequest>('entry_requests', id); if (!entry) throw new AppError(404, 'NOT_FOUND', 'Request simulasi tidak ditemukan.'); return entry; }
  position(id: string) { const p = this.store.get<Position>('positions', id); if (!p) throw new AppError(404, 'NOT_FOUND', 'Posisi simulasi tidak ditemukan.'); return p; }
  request(signalId: string, portfolioId: string, key: string, actor: 'manual' | 'auto' | 'telegram' = 'manual') {
    z.uuid().parse(signalId); z.uuid().parse(portfolioId);
    if (!this.accepting) throw new AppError(503, 'UNAVAILABLE', 'Aplikasi sedang berhenti; entry baru ditolak.');
    const p = this.risk.portfolio(portfolioId);
    if ((actor === 'auto' && (p.mode !== 'strategy' || p.experimentId !== this.settings.activeExperiment())) || (actor !== 'auto' && p.mode !== 'manual')) throw new AppError(409, 'CONFLICT', 'Kanal entry tidak cocok dengan portfolio.');
    const result = this.idempotent(`entry:${portfolioId}`, key, { signalId, portfolioId }, (id) => this.entry(id), () => {
      const existing = this.store.list<EntryRequest>('entry_requests', 'portfolio_id=? AND signal_id=?', [portfolioId, signalId])[0]; if (existing) return existing;
      const signal = this.signals.get(signalId), result = this.risk.reserve(signal, portfolioId, key);
      const entry = result.entry ?? this.risk.saveEntry(entryRequestSchema.parse({ id: this.store.id(), portfolioId, signalId, mint: signal.token.mint, requestedAt: this.store.now(), expiresAt: signal.expiresAt, state: 'REJECTED', reservedCashIdr: '0', reservedRiskIdr: '0', idempotencyKey: key, reasonCodes: result.preview.reasonCodes, positionId: null }));
      this.decision(signal, portfolioId, entry.state, entry.reasonCodes, { preview: result.preview, actor }, `entry:${entry.id}`);
      this.events.append('entry.updated', entry.id, { entryId: entry.id, state: entry.state, simulation: true }, portfolioId);
      return entry;
    });
    this.events.flush(); return result;
  }
  private decision(signal: Signal, portfolioId: string, outcome: string, reasonCodes: string[], evidence: Record<string, unknown>, dedupe: string) {
    if (this.store.list('decisions', 'dedupe_key=?', [dedupe]).length) return;
    const decision: Decision = { id: this.store.id(), portfolioId, tokenId: signal.tokenId, signalId: signal.id, evaluatedAt: this.store.now(), outcome, reasonCodes, evidence };
    this.store.put('decisions', decision, { token_id: signal.tokenId, portfolio_id: portfolioId, evaluated_at: decision.evaluatedAt, dedupe_key: dedupe }, true);
  }
  savePosition(p: Position) { return this.store.put('positions', positionSchema.parse(p), { portfolio_id: p.portfolioId, signal_id: p.signalId, pool_id: p.poolId, mint: p.mint, state: p.state }); }
  private saveCash(p: Portfolio, cash: string) { if (new D(cash).lt(0)) throw new Error('Invariant kas negatif.'); this.store.put('portfolios', { ...p, cashIdr: cash }, { experiment_id: p.experimentId, mode: p.mode }); }
  private ledger(p: Position, fill: Fill, amount: string, reason: string) {
    const entry: LedgerEntry = { id: this.store.id(), portfolioId: p.portfolioId, positionId: p.id, fillId: fill.id, amountIdrSigned: amount, reason, createdAt: this.store.now() };
    this.store.put('fills', fill, { position_id: p.id, side: fill.side, source_snapshot_id: fill.sourceSnapshotId }, true);
    this.store.put('cash_ledger', entry, { portfolio_id: p.portfolioId, position_id: p.id, fill_id: fill.id }, true);
  }
  private fillEntry(entry: EntryRequest, snapshot: Snapshot) {
    if (snapshot.observedAt <= entry.requestedAt || !this.market.fresh(snapshot)) return;
    const preview = this.risk.preview(entry.signalId, entry.portfolioId, entry.id);
    if (!preview.allowed) {
      if (preview.reasonCodes.every((code) => code === 'OUTSIDE_ENTRY_RANGE')) return;
      const updated = this.risk.release(entry, 'REJECTED', preview.reasonCodes);
      this.decision(this.store.get<Signal>('signals', entry.signalId)!, entry.portfolioId, 'REJECTED', preview.reasonCodes, { preview, snapshot }, `entry:${entry.id}:rejected`);
      this.events.append('entry.updated', entry.id, { state: updated.state, reasonCodes: updated.reasonCodes }, entry.portfolioId); return;
    }
    const signal = this.signals.get(entry.signalId), portfolio = this.risk.portfolio(entry.portfolioId), token = this.market.token(entry.mint), cost = this.risk.costs(portfolio), fx = this.risk.fx(portfolio);
    const buy = buyCost(preview.quantity, snapshot.priceUsd, fx, cost);
    const position = positionSchema.parse({ id: this.store.id(), portfolioId: portfolio.id, signalId: signal.id, poolId: signal.poolId, mint: entry.mint, state: 'OPEN', quantityRaw: preview.quantityRaw, decimals: token.decimals, entryObservedPrice: snapshot.priceUsd, entryEffectivePrice: buy.effective, entryCostIdr: buy.total, entryFeesIdr: buy.fees, stopPrice: signal.entry.stopUsd, targetPrice: preview.targetObservedUsd, openedAt: this.store.now(), dueAt: new Date(this.store.clock.now().getTime() + signal.exitPlan.maxHoldMinutes * 60_000).toISOString(), closedAt: null, plannedRiskIdr: preview.plannedLossIdr, configRefs: preview.configVersionIds, exitFeesIdr: null, pnlIdr: null, exitReason: null, qualityFlags: [] });
    this.savePosition(position);
    const fill: Fill = { id: this.store.id(), positionId: position.id, side: 'BUY', quantityRaw: position.quantityRaw, observedPrice: snapshot.priceUsd, effectivePrice: buy.effective, feesIdr: buy.fees, observedAt: snapshot.observedAt, filledAt: this.store.now(), sourceSnapshotId: snapshot.id, qualityFlags: [], costConfigId: portfolio.costConfigId };
    this.ledger(position, fill, new D(buy.total).negated().toFixed(), 'SIMULATED_ENTRY'); this.saveCash(portfolio, new D(portfolio.cashIdr).minus(buy.total).toFixed());
    this.risk.saveEntry({ ...entry, state: 'FILLED', positionId: position.id, reservedCashIdr: '0', reservedRiskIdr: '0' });
    this.events.append('entry.updated', entry.id, { state: 'FILLED', positionId: position.id, simulation: true }, portfolio.id);
    this.events.append('position.updated', position.id, { state: 'OPEN', simulation: true }, portfolio.id);
  }
  requestClose(positionId: string, key: string, confirmed: boolean) {
    if (!confirmed) throw new AppError(400, 'INVALID_REQUEST', 'Penutupan simulasi memerlukan konfirmasi.');
    const result = this.idempotent('close', key, { positionId, confirmed }, (id) => this.position(id), () => {
      const p = this.position(positionId); if (p.state === 'CLOSED') return p;
      if (!this.store.list('exit_intents', 'position_id=?', [p.id]).length) {
        const intent: ExitIntent = { id: this.store.id(), positionId: p.id, requestedAt: this.store.now(), reason: 'MANUAL', confirmed: true };
        this.store.put('exit_intents', intent, { position_id: p.id }, true); this.events.append('position.updated', p.id, { state: p.state, exitRequested: true, simulation: true }, p.portfolioId);
      }
      return p;
    });
    this.events.flush(); return result;
  }
  securityChanged(tokenId: string) {
    if (this.security.latest(tokenId)?.status !== 'FAIL') return;
    const token = this.store.get<{ mint: string }>('tokens', tokenId)!;
    this.store.transaction(() => {
      for (const p of this.store.list<Position>('positions', "mint=? AND state IN ('OPEN','UNPRICED')", [token.mint])) {
        const old = this.store.list<ExitIntent>('exit_intents', 'position_id=?', [p.id])[0];
        this.store.put('exit_intents', { id: old?.id ?? this.store.id(), positionId: p.id, requestedAt: this.store.now(), reason: 'SECURITY', confirmed: true }, { position_id: p.id });
        this.events.append('position.updated', p.id, { exitRequested: true, reason: 'SECURITY', simulation: true }, p.portfolioId);
      }
    }); this.events.flush();
  }
  private exitReason(p: Position, snapshot: Snapshot) {
    const token = this.market.token(p.mint), intent = this.store.list<ExitIntent>('exit_intents', 'position_id=?', [p.id])[0];
    if (this.security.latest(token.id)?.status === 'FAIL' || (intent?.reason === 'SECURITY' && snapshot.observedAt > intent.requestedAt)) return 'SECURITY';
    if (new D(snapshot.priceUsd).lte(p.stopPrice)) return 'STOP'; if (new D(snapshot.priceUsd).gte(p.targetPrice)) return 'TARGET';
    const bars = this.signals.contiguousBars(p.poolId);
    const averages = ema(bars.map((b) => b.close), 21);
    if (bars.length >= 22 && bars.at(-1)!.openAt === bars.at(-2)!.closeAt && new D(bars.at(-1)!.close).lt(averages.at(-1)!) && new D(bars.at(-2)!.close).lt(averages.at(-2)!)) return 'TREND';
    if (this.store.now() >= p.dueAt) return 'TIME';
    if (intent?.reason === 'MANUAL' && snapshot.observedAt > intent.requestedAt) return 'MANUAL';
    return null;
  }
  private fillExit(p: Position, snapshot: Snapshot) {
    const reason = this.exitReason(p, snapshot); if (!reason) { if (p.state === 'UNPRICED') this.savePosition({ ...p, state: 'OPEN' }); return; }
    const portfolio = this.risk.portfolio(p.portfolioId), q = new D(p.quantityRaw).div(new D(10).pow(p.decimals)), sell = sellProceeds(q.toFixed(), snapshot.priceUsd, this.risk.fx(portfolio), this.risk.costs(portfolio));
    // Net liquidation may exceed remaining cash only under an invalid cost model; don't fabricate debt/fill.
    if (new D(portfolio.cashIdr).plus(sell.total).lt(0)) { this.savePosition({ ...p, state: 'UNPRICED', qualityFlags: [...new Set([...p.qualityFlags, 'INSUFFICIENT_EXIT_CASH'])] }); return; }
    const qualityFlags = [...new Set([...p.qualityFlags, ...(p.state === 'UNPRICED' ? ['DATA_GAP'] : [])])];
    const fill: Fill = { id: this.store.id(), positionId: p.id, side: 'SELL', quantityRaw: p.quantityRaw, observedPrice: snapshot.priceUsd, effectivePrice: sell.effective, feesIdr: sell.fees, observedAt: snapshot.observedAt, filledAt: this.store.now(), sourceSnapshotId: snapshot.id, qualityFlags, costConfigId: p.configRefs.cost };
    this.ledger(p, fill, sell.total, 'SIMULATED_EXIT');
    this.saveCash(portfolio, new D(portfolio.cashIdr).plus(sell.total).toFixed());
    this.savePosition({ ...p, state: 'CLOSED', closedAt: this.store.now(), pnlIdr: new D(sell.total).minus(p.entryCostIdr).toFixed(), exitFeesIdr: sell.fees, exitReason: reason, qualityFlags });
    this.events.append('position.updated', p.id, { state: 'CLOSED', exitReason: reason, simulation: true }, p.portfolioId);
  }
  consume(snapshot: Snapshot) {
    if (!this.market.fresh(snapshot)) return;
    this.store.transaction(() => {
      this.expire();
      for (const p of this.settings.portfolios()) { const v = this.risk.valuation(p.id); this.risk.daily(p.id, v.equityIdr); }
      const recoveredGap = this.store.list<DataGap>('data_gaps').some((g) => g.scope === snapshot.poolId && g.endedAt === snapshot.observedAt);
      for (const p of this.store.list<Position>('positions', "pool_id=? AND state IN ('OPEN','UNPRICED')", [snapshot.poolId])) if (snapshot.observedAt > p.openedAt) this.fillExit(recoveredGap ? { ...p, state: 'UNPRICED', qualityFlags: [...new Set([...p.qualityFlags, 'DATA_GAP'])] } : p, snapshot);
      for (const entry of this.store.list<EntryRequest>('entry_requests', "state='PENDING'")) {
        const signal = this.store.get<Signal>('signals', entry.signalId)!;
        if (signal.poolId === snapshot.poolId) this.fillEntry(entry, snapshot);
      }
      this.recordEquity();
    }); this.events.flush();
  }
  expire() {
    for (const entry of this.store.list<EntryRequest>('entry_requests', "state='PENDING'")) if (this.store.now() >= entry.expiresAt) {
      this.risk.release(entry, 'EXPIRED', ['SIGNAL_EXPIRED']); this.events.append('entry.updated', entry.id, { state: 'EXPIRED' }, entry.portfolioId);
      this.decision(this.store.get<Signal>('signals', entry.signalId)!, entry.portfolioId, 'EXPIRED', ['SIGNAL_EXPIRED'], {}, `entry:${entry.id}:expired`);
    }
  }
  recordEquity() {
    for (const p of this.settings.portfolios()) {
      const v = this.risk.valuation(p.id), old = this.store.list<EquitySnapshot>('equity_snapshots', 'portfolio_id=? AND observed_at=?', [p.id, this.store.now()])[0];
      this.risk.daily(p.id, v.equityIdr);
      const previous = this.store.list<EquitySnapshot>('equity_snapshots', 'portfolio_id=?', [p.id], 'observed_at DESC LIMIT 1')[0];
      if (!old && previous && previous.cashIdr === p.cashIdr && previous.equityIdr === v.equityIdr && Date.parse(this.store.now()) - Date.parse(previous.observedAt) < 30_000) continue;
      const value: EquitySnapshot = { id: old?.id ?? this.store.id(), portfolioId: p.id, observedAt: this.store.now(), cashIdr: p.cashIdr, equityIdr: v.equityIdr, qualityFlags: v.unpriced ? ['DATA_GAP','UNPRICED'] : [] };
      this.store.put('equity_snapshots', value, { portfolio_id: p.id, observed_at: value.observedAt });
    }
  }
  tick() {
    this.store.transaction(() => {
      this.expire();
      for (const p of this.store.list<Position>('positions', "state IN ('OPEN','UNPRICED')")) if (!this.market.fresh(this.market.latest(p.poolId)) && p.state !== 'UNPRICED') {
        this.savePosition({ ...p, state: 'UNPRICED', qualityFlags: [...new Set([...p.qualityFlags, 'DATA_GAP'])] }); this.events.append('position.updated', p.id, { state: 'UNPRICED' }, p.portfolioId);
      }
    });
    const auto = this.settings.portfolios().find((p) => p.mode === 'strategy' && p.experimentId === this.settings.activeExperiment());
    if (auto && this.accepting) for (const signal of this.signals.list().filter((s) => s.state === 'VALID').sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id))) this.request(signal.id, auto.id, `auto:${auto.id}:${signal.id}`, 'auto');
    this.recordEquity(); this.events.flush();
  }
  list(portfolioId?: string) { return this.store.list<Position>('positions', portfolioId ? 'portfolio_id=?' : '1=1', portfolioId ? [portfolioId] : [], 'rowid DESC').map((p) => ({ ...p, simulation: true, snapshot: this.market.latest(p.poolId) ?? null, stale: !this.market.fresh(this.market.latest(p.poolId)), exitIntent: this.store.list<ExitIntent>('exit_intents', 'position_id=?', [p.id])[0] ?? null })); }
}
