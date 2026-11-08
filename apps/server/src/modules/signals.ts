import { D, ema, evaluateStrategy, strategyParameters } from '@memecoin/domain';
import type { SecurityCheck } from '@memecoin/contracts';
import type { Bar, Decision, Pool, Signal, Snapshot, Token } from '@memecoin/contracts';
import { signalSchema } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { AppError, SettingsService, strategyDefaults } from './settings.ts';
import { MarketService } from './market.ts';
import { SecurityService } from './security.ts';
import { NewsService } from './news.ts';
import { Events } from './events.ts';

export class SignalService {
  readonly store: Store; readonly settings: SettingsService; readonly market: MarketService; readonly security: SecurityService; readonly news: NewsService; readonly events: Events;
  constructor(store: Store, settings: SettingsService, market: MarketService, security: SecurityService, news: NewsService, events: Events) { this.store = store; this.settings = settings; this.market = market; this.security = security; this.news = news; this.events = events; }
  list() { this.invalidate(); return this.store.list<Signal>('signals', '1=1', [], 'rowid DESC'); }
  get(id: string) { this.invalidate(); const signal = this.store.get<Signal>('signals', id); if (!signal) throw new AppError(404, 'NOT_FOUND', 'Sinyal tidak ditemukan.'); return signalSchema.parse(signal); }
  bars(poolId: string, since?: string) { return this.store.list<Bar>('sample_bars', since ? 'pool_id=? AND open_at>=?' : 'pool_id=?', since ? [poolId, since] : [poolId], 'open_at ASC'); }
  contiguousBars(poolId: string) {
    const bars = this.bars(poolId).filter((b) => b.closeAt <= this.store.now()); let start = 0;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]!, previous = bars[i - 1];
      if (!bar.complete || bar.gap || bar.sampleCount < 2) start = i + 1;
      else if (previous && (bar.openAt !== previous.closeAt || Date.parse(bar.firstObservedAt) - Date.parse(previous.lastObservedAt) > 90_000)) start = i;
    }
    const sequence = bars.slice(start);
    return sequence.length && Date.parse(this.store.now()) - Date.parse(sequence.at(-1)!.closeAt) <= 90_000 ? sequence : [];
  }
  thesis(poolId: string) {
    const bars = this.contiguousBars(poolId);
    const closes = bars.map((b) => b.close), fast = ema(closes, 9).at(-1), slow = ema(closes, 21).at(-1);
    return !!fast && !!slow && new D(fast).gt(slow) && new D(closes.at(-1)!).gt(slow);
  }
  gate(signal: Signal): string[] {
    const snapshot = this.market.latest(signal.poolId), security = this.security.latest(signal.tokenId), reasons: string[] = [];
    if (this.store.now() >= signal.expiresAt || signal.state === 'EXPIRED') reasons.push('SIGNAL_EXPIRED');
    if (signal.state === 'INVALIDATED') reasons.push('SIGNAL_INVALIDATED');
    if (!this.market.fresh(snapshot)) reasons.push('STALE_MARKET');
    if (security?.status === 'FAIL') reasons.push('SECURITY_FAIL');
    if (snapshot && (new D(snapshot.liquidityUsd).lt(strategyParameters.minimumLiquidityUsd) || !snapshot.volume24hUsd || new D(snapshot.volume24hUsd).lt(strategyParameters.minimumVolumeUsd))) reasons.push('UNIVERSE_INVALID');
    if (!this.thesis(signal.poolId)) reasons.push('TREND_INVALID');
    const need = strategyParameters.warmup;
    const bars = this.bars(signal.poolId).filter((b) => b.closeAt <= this.store.now()).slice(-need);
    if (bars.length < need || bars.some((b, i) => !b.complete || b.gap || b.sampleCount < 2 || (i > 0 && (b.openAt !== bars[i - 1]!.closeAt || Date.parse(b.firstObservedAt) - Date.parse(bars[i - 1]!.lastObservedAt) > 90_000)))) reasons.push('DATA_GAP');
    return reasons;
  }
  invalidate() {
    this.market.closeBars();
    for (const signal of this.store.list<Signal>('signals', "state='VALID'")) {
      const reasons = this.gate(signal);
      if (reasons.length) this.store.transaction(() => {
        const state = reasons.includes('SIGNAL_EXPIRED') ? 'EXPIRED' as const : 'INVALIDATED' as const;
        this.store.put('signals', { ...signal, state }, { token_id: signal.tokenId, pool_id: signal.poolId, state, expires_at: signal.expiresAt });
        this.store.put('signal_events', { id: this.store.id(), signalId: signal.id, occurredAt: this.store.now(), eventType: state, reasonCodes: reasons }, { signal_id: signal.id }, true);
        this.events.append('signal.updated', signal.id, { state, reasonCodes: reasons });
      });
    }
    this.events.flush();
  }
  evaluate() {
    this.invalidate();
    for (const token of this.market.tokens().filter((t) => t.watchlistEnabled)) this.evaluateToken(token);
    this.events.flush();
  }
  evaluateToken(token: Token) {
    const snapshot = token.canonicalPoolId ? this.market.latest(token.canonicalPoolId) : undefined;
    const pool = token.canonicalPoolId ? this.store.get<Pool>('pools', token.canonicalPoolId) : undefined;
    const security = this.security.latest(token.id);
    const barTime = token.canonicalPoolId ? this.bars(token.canonicalPoolId).filter((b) => b.closeAt <= this.store.now()).at(-1)?.closeAt : undefined;
    const dedupe = `strategy:${token.id}:${token.canonicalPoolId}:${barTime ?? this.store.now().slice(0, 16)}`;
    if (this.store.list('decisions', 'dedupe_key=?', [dedupe]).length) return;
    const previous = this.store.list<Signal>('signals', 'token_id=?', [token.id], 'rowid DESC');
    const result = snapshot && pool ? evaluateStrategy({ now: this.store.now(), warmupSince: token.warmupSince, bars: this.bars(pool.id), ...snapshot, poolCreatedAt: pool.createdAtSource, securityStatus: security?.status ?? 'UNKNOWN', securityCheckedAt: security?.checkedAt ?? this.store.now(), securityExpiresAt: security?.expiresAt ?? this.store.now(), lastSignalAt: previous[0]?.publishedAt ?? null, hasValidSignal: previous.some((s) => s.state === 'VALID') }) : { eligible: false, reasonCodes: ['STALE_MARKET'], entry: null, indicators: {}, barCloseAt: barTime ?? null };
    this.store.transaction(() => {
      let signalId: string | null = null;
      if (result.eligible && result.entry && snapshot && pool) {
        const config = this.settings.config('strategy', 'momentum-pullback-v1', strategyDefaults);
        const attachedSecurity: SecurityCheck = security ?? { id: this.store.id(), tokenId: token.id, checkedAt: this.store.now(), expiresAt: this.store.now(), status: 'UNKNOWN', checks: [{ code: 'SECURITY_PENDING', status: 'UNKNOWN', text: 'Pemeriksaan RPC belum tersedia; sinyal eksperimen tetap diterbitkan.' }], evidence: {}, decoderVersion: 'pending', largestRatio: null, top10Ratio: null, limitations: ['Security UNKNOWN bukan bukti aman.'] };
        const signal = signalSchema.parse({ id: this.store.id(), tokenId: token.id, poolId: pool.id, state: 'VALID', token: { chain: 'solana', mint: token.mint, name: token.name, symbol: token.symbol }, publishedAt: this.store.now(), expiresAt: new Date(this.store.clock.now().getTime() + strategyParameters.expirySeconds * 1000).toISOString(), entry: result.entry,
          exitPlan: { maxHoldMinutes: strategyParameters.maxHoldMinutes, targetNetR: '1.5', invalidationReasons: ['STALE_MARKET','SECURITY_FAIL','TREND_INVALID','UNIVERSE_INVALID'] },
          scenarios: { bullish: 'Jika pemulihan berlanjut, posisi simulasi dievaluasi terhadap target net setelah biaya. Bukan jaminan kenaikan 10–50%.', neutral: 'Jika momentum tidak berlanjut, tunggu; sinyal berakhir setelah 10 menit.', bearish: 'Jika stop atau tesis dilanggar, rencana keluar memakai observasi valid berikutnya.' },
          reasons: Object.entries(result.indicators).map(([code, value]) => ({ code, text: `${code}: ${value}`, evidenceIds: [snapshot.id, attachedSecurity.id] })), security: attachedSecurity,
          dataQuality: { observedAt: snapshot.observedAt, stale: false, gaps: false, sampling: 'sampled' }, newsIds: this.news.list(token.mint).map((n) => n.id), strategyVersion: config.version, strategyConfigId: config.id, configHash: config.hash,
          evidence: { snapshot, bars: this.bars(pool.id, token.warmupSince), pool, security: attachedSecurity, indicators: result.indicators, evaluatedAt: this.store.now() },
        });
        this.store.put('signals', signal, { token_id: token.id, pool_id: pool.id, state: signal.state, expires_at: signal.expiresAt }, true);
        this.store.put('signal_events', { id: this.store.id(), signalId: signal.id, eventType: 'CREATED', occurredAt: this.store.now(), reasonCodes: [] }, { signal_id: signal.id }, true);
        this.events.append('signal.created', signal.id, { signalId: signal.id }); signalId = signal.id;
      }
      const decision: Decision = { id: this.store.id(), tokenId: token.id, portfolioId: null, signalId, evaluatedAt: this.store.now(), outcome: signalId ? 'SIGNAL' : 'SKIP', reasonCodes: result.reasonCodes, evidence: { snapshotId: snapshot?.id ?? null, barCloseAt: result.barCloseAt, indicators: result.indicators } };
      this.store.put('decisions', decision, { token_id: token.id, portfolio_id: null, evaluated_at: decision.evaluatedAt, dedupe_key: dedupe }, true);
      this.market.saveToken({ ...this.store.get<Token>('tokens', token.id)!, candidateState: signalId ? 'ELIGIBLE' : result.reasonCodes.includes('WARMUP_REQUIRED') ? 'WARMING_UP' : 'BLOCKED', reasonCodes: result.reasonCodes });
    });
  }
  latestSnapshot(signal: Signal): Snapshot | undefined { return this.market.latest(signal.poolId); }
}
