import { expect, it } from 'vitest';
import { createTradingFixture } from '../../../../tests/fixtures/trading.ts';

it('previews without reservations and atomically prevents duplicate mint reservations', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(); const experiment = f.services.settings.create({ fxUsdIdr: '16000', activate: true });
    const portfolio = experiment.portfolios[1]!;
    expect(f.services.risk.preview(signal.id, portfolio.id).allowed).toBe(true); expect(f.store.list('entry_requests')).toHaveLength(0);
    const entries = await Promise.all([1,2].map(async (n) => f.services.risk.reserve(signal, portfolio.id, String(n))));
    expect(entries.filter((result) => result.entry)).toHaveLength(1);
    expect(f.services.risk.valuation(portfolio.id).count).toBe(1);
    expect(f.services.risk.valuation(experiment.portfolios[0]!.id).reservedCashIdr).toBe('0');
    const first = entries.find((r) => r.entry)!.entry!; f.services.risk.release(first, 'CANCELLED', ['USER_CANCEL']);
    expect(f.services.risk.valuation(portfolio.id).reservedCashIdr).toBe('0');
  } finally { await f.services.close(); }
});
it('latches daily halt through recovery and requires fresh valuation at UTC+7 reset', async () => {
  const f = createTradingFixture();
  try {
    const p = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[0]!;
    f.services.risk.daily(p.id, '500000'); expect(f.services.risk.daily(p.id, '485000').haltedAt).not.toBeNull();
    expect(f.services.risk.daily(p.id, '510000').haltedAt).not.toBeNull();
    f.clock.advance(17 * 3600_000); expect(f.services.risk.daily(p.id, null).resetPending).toBe(true);
    const day = f.services.risk.daily(p.id, '499000'); expect(day.resetPending).toBe(false); expect(day.openingEquityIdr).toBe('499000'); expect(day.haltedAt).toBeNull();
  } finally { await f.services.close(); }
});
