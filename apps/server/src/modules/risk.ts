import { D, calculateSizing, dayKey, sellProceeds } from '@memecoin/domain';
import type { CostModel, RiskModel } from '@memecoin/domain';
import type { ConfigVersion, EntryRequest, Portfolio, PortfolioDay, Position, Signal } from '@memecoin/contracts';
import { entryRequestSchema } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { AppError, SettingsService } from './settings.ts';
import { MarketService } from './market.ts';
import { SignalService } from './signals.ts';

export class RiskService {
  readonly store: Store; readonly settings: SettingsService; readonly market: MarketService; readonly signals: SignalService;
  constructor(store: Store, settings: SettingsService, market: MarketService, signals: SignalService) { this.store = store; this.settings = settings; this.market = market; this.signals = signals; }
  portfolio(id: string) { const p = this.store.get<Portfolio>('portfolios', id); if (!p) throw new AppError(404, 'NOT_FOUND', 'Portfolio tidak ditemukan.'); return p; }
  config<T>(id: string): T { const c = this.store.get<ConfigVersion>('config_versions', id); if (!c) throw new AppError(503, 'UNAVAILABLE', 'Versi konfigurasi tidak tersedia.'); return c.payload as unknown as T; }
  costs(p: Portfolio) { return this.config<CostModel>(p.costConfigId); }
  fx(p: Portfolio) { return this.config<{ usdIdr: string }>(p.fxConfigId).usdIdr; }
  positions(id: string) { return this.store.list<Position>('positions', "portfolio_id=? AND state IN ('OPEN','UNPRICED')", [id]); }
  pending(id: string, exclude?: string) { return this.store.list<EntryRequest>('entry_requests', "portfolio_id=? AND state='PENDING'", [id]).filter((p) => p.id !== exclude); }
  valuation(portfolioId: string, excludeEntry?: string) {
    const p = this.portfolio(portfolioId), positions = this.positions(p.id), pending = this.pending(p.id, excludeEntry), fx = this.fx(p), cost = this.costs(p);
    let equity = new D(p.cashIdr), openRisk = new D(0), unpriced = false;
    for (const position of positions) {
      const snapshot = this.market.latest(position.poolId);
      if (position.state === 'UNPRICED' || !this.market.fresh(snapshot)) { unpriced = true; openRisk = openRisk.plus(position.plannedRiskIdr); continue; }
      const q = new D(position.quantityRaw).div(new D(10).pow(position.decimals));
      const proceeds = new D(sellProceeds(q.toFixed(), snapshot!.priceUsd, fx, cost).total);
      equity = equity.plus(proceeds); openRisk = openRisk.plus(D.max(position.plannedRiskIdr, new D(position.entryCostIdr).minus(proceeds)));
    }
    const cashReserved = pending.reduce((sum, entry) => sum.plus(entry.reservedCashIdr), new D(0));
    const totalRisk = pending.reduce((sum, entry) => sum.plus(entry.reservedRiskIdr), openRisk);
    return { portfolio: p, equityIdr: unpriced ? null : equity.toFixed(), availableCashIdr: new D(p.cashIdr).minus(cashReserved).toFixed(), reservedCashIdr: cashReserved.toFixed(), openRiskIdr: totalRisk.toFixed(), count: positions.length + pending.length, unpriced, positions, pending };
  }
  daily(portfolioId: string, equityIdr: string | null): PortfolioDay {
    const key = dayKey(this.store.now()), id = `${portfolioId}:${key}`;
    let day = this.store.get<PortfolioDay>('portfolio_days', id);
    if (!day) day = { id, portfolioId, dayKey: key, openingEquityIdr: equityIdr, haltedAt: null, resetPending: equityIdr === null };
    if (day.resetPending && equityIdr !== null) day = { ...day, openingEquityIdr: equityIdr, resetPending: false };
    const risk = this.config<RiskModel>(this.portfolio(portfolioId).riskConfigId);
    if (!day.haltedAt && day.openingEquityIdr !== null && equityIdr !== null && new D(equityIdr).lte(new D(day.openingEquityIdr).mul(new D(1).minus(risk.dailyLoss)))) day = { ...day, haltedAt: this.store.now() };
    return this.store.put('portfolio_days', day, { portfolio_id: portfolioId, day_key: key });
  }
  preview(signalId: string, portfolioId: string, excludeEntry?: string) {
    const signal = this.signals.get(signalId), snapshot = this.market.latest(signal.poolId), token = this.market.token(signal.token.mint);
    const value = this.valuation(portfolioId, excludeEntry), portfolio = value.portfolio, day = this.daily(portfolioId, value.equityIdr);
    const reasonCodes = this.signals.gate(signal);
    if (token.decimals === null) reasonCodes.push('SECURITY_UNKNOWN');
    if (snapshot && (new D(snapshot.priceUsd).lt(signal.entry.lowUsd) || new D(snapshot.priceUsd).gt(signal.entry.highUsd))) reasonCodes.push('OUTSIDE_ENTRY_RANGE');
    const result = calculateSizing({ observedUsd: snapshot?.priceUsd ?? '0', stopUsd: signal.entry.stopUsd, fxUsdIdr: this.fx(portfolio), equityIdr: value.equityIdr ?? '0', availableCashIdr: value.availableCashIdr, liquidityUsd: snapshot?.liquidityUsd ?? '0', decimals: token.decimals ?? 0, existingRiskIdr: value.openRiskIdr, count: value.count, duplicateMint: [...value.positions, ...value.pending].some((p) => p.mint === token.mint), unpriced: value.unpriced, halted: !!day.haltedAt || day.resetPending, cost: this.costs(portfolio), risk: this.config<RiskModel>(portfolio.riskConfigId) });
    return { ...result, allowed: result.allowed && !reasonCodes.length, reasonCodes: [...new Set([...reasonCodes, ...result.reasonCodes])], signalId, portfolioId, observedAt: this.store.now(), expiresAt: signal.expiresAt, equityBasisIdr: value.equityIdr, availableCashIdr: value.availableCashIdr, configVersionIds: { fx: portfolio.fxConfigId, risk: portfolio.riskConfigId, cost: portfolio.costConfigId, strategy: signal.strategyConfigId }, feeAssumptions: this.costs(portfolio), simulation: true as const };
  }
  reserve(signal: Signal, portfolioId: string, idempotencyKey: string) {
    return this.store.transaction(() => {
      const preview = this.preview(signal.id, portfolioId);
      if (!preview.allowed) return { entry: null, preview };
      const entry = entryRequestSchema.parse({ id: this.store.id(), portfolioId, signalId: signal.id, mint: signal.token.mint, requestedAt: this.store.now(), expiresAt: signal.expiresAt, state: 'PENDING', reservedCashIdr: preview.entryCostIdr, reservedRiskIdr: preview.plannedLossIdr, idempotencyKey, reasonCodes: [], positionId: null });
      this.saveEntry(entry); return { entry, preview };
    });
  }
  saveEntry(entry: EntryRequest) { return this.store.put('entry_requests', entryRequestSchema.parse(entry), { portfolio_id: entry.portfolioId, signal_id: entry.signalId, mint: entry.mint, state: entry.state }); }
  release(entry: EntryRequest, state: 'EXPIRED' | 'REJECTED' | 'CANCELLED', reasons: string[]) { return this.saveEntry({ ...entry, state, reservedCashIdr: '0', reservedRiskIdr: '0', reasonCodes: reasons }); }
}
