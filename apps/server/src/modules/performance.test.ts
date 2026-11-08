import { expect, it } from 'vitest';
import { sum } from '@memecoin/domain';
import { createTradingFixture } from '../../../../tests/fixtures/trading.ts';
it('reconciles journal and CSV with immutable ledger and excludes open trades from win rate', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(), portfolio = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
    f.services.paper.request(signal.id, portfolio.id, 'journal'); await f.observe('1.066');
    expect(f.services.performance.report({ portfolioId: portfolio.id }).metrics.closedCount).toBe(0);
    const position = f.services.paper.list()[0]!; f.services.paper.requestClose(position.id, 'close', true); await f.observe('1.1');
    const report = f.services.performance.report({ portfolioId: portfolio.id });
    expect(report.metrics.closedCount).toBe(1); expect(report.metrics.netPnlIdr).toBe(sum(report.trades[0]!.ledger.map((l) => l.amountIdrSigned)).toFixed());
    expect(report.metrics.feesIdr).toBe(sum(report.trades[0]!.fills.map((fill) => fill.feesIdr)).toFixed());
    expect(f.services.performance.csv({ portfolioId: portfolio.id })).toContain(report.metrics.netPnlIdr);
    expect(() => f.services.performance.report({ portfolioId: portfolio.id, strategyConfigId: f.store.id() })).toThrow('Versi strategi');
    expect(f.services.performance.report({ portfolioId: portfolio.id, to: position.openedAt }).metrics.closedCount).toBe(0);
  } finally { await f.services.close(); }
});
