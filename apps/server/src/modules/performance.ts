import { csvCell, D, drawdown, sum, tradeMetrics } from '@memecoin/domain';
import { performanceQuerySchema, performanceSchema } from '@memecoin/contracts';
import type { DataGap, Decision, EquitySnapshot, Fill, LedgerEntry, Position, Signal } from '@memecoin/contracts';
import type { Services } from './services.ts';
import { AppError } from './settings.ts';

export class PerformanceService {
  readonly services: Services;
  constructor(services: Services) { this.services = services; }
  report(input: unknown) {
    const query = performanceQuerySchema.parse(input), { store, risk, settings } = this.services, portfolio = risk.portfolio(query.portfolioId);
    if (query.strategyConfigId && query.strategyConfigId !== portfolio.strategyConfigId) throw new AppError(400, 'INVALID_REQUEST', 'Versi strategi tidak sesuai portfolio. Pilih portfolio eksperimen tersebut.');
    const from = query.from ?? portfolio.createdAt, to = query.to ?? store.now(), inPeriod = (time: string) => time >= from && time <= to;
    const allPositions = store.list<Position>('positions', 'portfolio_id=?', [portfolio.id]);
    const allLedger = store.list<LedgerEntry>('cash_ledger', 'portfolio_id=?', [portfolio.id]);
    const positions = allPositions.filter((p) => p.openedAt <= to && (!p.closedAt || p.closedAt >= from));
    const trades = positions.map((position) => {
      const fills = store.list<Fill>('fills', 'position_id=?', [position.id]);
      const ledger = allLedger.filter((l) => l.positionId === position.id);
      const periodLedger = ledger.filter((l) => inPeriod(l.createdAt));
      const closedInPeriod = position.state === 'CLOSED' && position.closedAt && inPeriod(position.closedAt);
      const netPnlIdr = closedInPeriod ? sum(periodLedger.map((l) => l.amountIdrSigned)).toFixed() : null;
      return { position, signal: store.get<Signal>('signals', position.signalId)!, fills, ledger: periodLedger, netPnlIdr };
    });
    const closed = trades.filter((t) => t.position.closedAt && inPeriod(t.position.closedAt) && t.netPnlIdr !== null);
    const periodFills = trades.flatMap((t) => t.fills.map((fill) => ({ fill, position: t.position }))).filter(({ fill }) => inPeriod(fill.filledAt));
    const fx = risk.fx(portfolio);
    const feesIdr = sum(periodFills.map(({ fill }) => fill.feesIdr)).toFixed();
    const slippageIdr = sum(periodFills.map(({ fill, position }) => new D(fill.effectivePrice).minus(fill.observedPrice).abs().mul(new D(position.quantityRaw).div(new D(10).pow(position.decimals))).mul(fx).toFixed())).toFixed();
    const equity = store.list<EquitySnapshot>('equity_snapshots', 'portfolio_id=? AND observed_at>=? AND observed_at<=?', [portfolio.id, from, to], 'observed_at ASC');
    const gaps = store.list<DataGap>('data_gaps').filter((g) => g.startedAt <= to && (!g.endedAt || g.endedAt >= from) && positions.some((p) => p.poolId === g.scope));
    const decisions = store.list<Decision>('decisions').filter((d) => (d.portfolioId === portfolio.id || d.portfolioId === null) && inPeriod(d.evaluatedAt));
    const skipped = decisions.filter((d) => ['SKIP','REJECTED','EXPIRED','BLOCKED'].includes(d.outcome)), skipReasons: Record<string, number> = {};
    for (const decision of skipped) for (const reason of decision.reasonCodes) skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    const valuation = risk.valuation(portfolio.id);
    return performanceSchema.parse({ portfolio, configs: settings.configs().filter((c) => [portfolio.strategyConfigId, portfolio.riskConfigId, portfolio.costConfigId, portfolio.fxConfigId].includes(c.id)), period: { from, to }, metrics: { ...tradeMetrics(closed.map((t) => ({ pnlIdr: t.netPnlIdr!, holdSeconds: (Date.parse(t.position.closedAt!) - Date.parse(t.position.openedAt)) / 1000 }))), feesIdr, slippageIdr, ...drawdown(equity, gaps.length > 0), currentExposureIdr: valuation.equityIdr === null ? null : new D(valuation.equityIdr).minus(portfolio.cashIdr).toFixed() }, coverage: { signals: this.services.signals.list().filter((s) => inPeriod(s.publishedAt) && s.strategyConfigId === portfolio.strategyConfigId).length, decisions: decisions.length, skipped: skipped.length, skipReasons, pending: risk.pending(portfolio.id).length, open: allPositions.filter((p) => p.state !== 'CLOSED').length, unpriced: allPositions.filter((p) => p.state === 'UNPRICED' || (p.state !== 'CLOSED' && !this.services.market.fresh(this.services.market.latest(p.poolId)))).length, gaps: gaps.length, validEquitySamples: equity.filter((e) => e.equityIdr !== null).length, missingEquitySamples: equity.filter((e) => e.equityIdr === null).length, eligibleTrades: trades.length }, equity, trades, limitations: ['SIMULASI berbasis model biaya; bukan bukti hasil live.', 'PnL closed mengikuti tanggal exit; fees/slippage mengikuti tanggal fill. Posisi terbuka bukan denominator win rate.', 'Exposure, pending, open, dan unpriced menunjukkan kondisi saat ini, bukan rekonstruksi periode lampau.', 'Drawdown teramati tidak membuktikan drawdown maksimum selama gap. Cakupan terbatas pada watchlist/rekaman yang tersedia.'] });
  }
  csv(input: unknown) {
    const report = this.report(input), header = ['portfolioId','mode','positionId','mint','state','openedAt','closedAt','netPnlIdr','feesIdr','exitReason','qualityFlags','strategyConfigId','riskConfigId','costConfigId','fxConfigId','fxUsdIdr'];
    const rows = report.trades.map((t) => [report.portfolio.id, report.portfolio.mode, t.position.id, t.position.mint, t.position.state, t.position.openedAt, t.position.closedAt, t.netPnlIdr, sum(t.fills.filter((f) => f.filledAt >= report.period.from && f.filledAt <= report.period.to).map((f) => f.feesIdr)).toFixed(), t.position.exitReason, t.position.qualityFlags.join('|'), t.position.configRefs.strategy, t.position.configRefs.risk, t.position.configRefs.cost, t.position.configRefs.fx, this.services.risk.fx(report.portfolio)]);
    return '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  }
}
