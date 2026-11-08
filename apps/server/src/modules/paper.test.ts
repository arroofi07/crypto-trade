import { expect, it } from 'vitest';
import { D, sum } from '@memecoin/domain';
import type { Fill, LedgerEntry, Position, SecurityCheck } from '@memecoin/contracts';
import { createTradingFixture } from '../../../../tests/fixtures/trading.ts';

it('exits on two closed candles below EMA21, but never calculates trend across a gap', async () => {
  for (const gap of [false, true]) {
    const f = createTradingFixture();
    try {
      const signal = await f.warmup(), p = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
      const entry = f.services.paper.request(signal.id, p.id, 'trend'); await f.observe('1.066');
      if (gap) f.clock.advance(180_000);
      for (let i = 0; i < 5; i++) await f.observe('1.03');
      const position = f.services.paper.position(f.services.paper.entry(entry.id).positionId!);
      if (gap) expect(position.state).toBe('OPEN'); else expect(position.exitReason).toBe('TREND');
    } finally { await f.services.close(); }
  }
});

it('uses the next observation for entry and manual exit; double clicks preserve one ledger/position', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(), p = f.services.settings.create({ fxUsdIdr: '16000', activate: true }).portfolios[1]!;
    const entry = f.services.paper.request(signal.id, p.id, 'same-key');
    expect(entry.state).toBe('PENDING'); expect(f.services.paper.request(signal.id, p.id, 'same-key').id).toBe(entry.id);
    expect(f.services.paper.request(signal.id, p.id, 'different-key').id).toBe(entry.id);
    expect(() => f.services.paper.request(f.store.id(), p.id, 'same-key')).toThrow('payload berbeda');
    f.services.paper.consume(f.services.market.latest(signal.poolId)!); expect(f.store.list('positions')).toHaveLength(0);
    await f.observe('1.066'); const filled = f.services.paper.entry(entry.id); expect(filled.state).toBe('FILLED');
    const position = f.services.paper.position(filled.positionId!); expect(position.entryObservedPrice).toBe('1.066');
    expect(f.services.paper.request(signal.id, p.id, 'same-key').positionId).toBe(position.id);
    expect(() => f.services.paper.requestClose(position.id, 'close', false)).toThrow('konfirmasi');
    f.services.paper.requestClose(position.id, 'close', true); f.services.paper.consume(f.services.market.latest(signal.poolId)!);
    expect(f.services.paper.position(position.id).state).toBe('OPEN');
    await f.observe('1.10'); const closed = f.services.paper.position(position.id); expect(closed.state).toBe('CLOSED'); expect(closed.exitReason).toBe('MANUAL');
    const ledger = f.store.list<LedgerEntry>('cash_ledger', 'portfolio_id=?', [p.id]);
    expect(sum(ledger.map((l) => l.amountIdrSigned)).toFixed()).toBe(f.services.risk.portfolio(p.id).cashIdr);
    expect(f.store.list<Fill>('fills')).toHaveLength(2); f.services.paper.requestClose(position.id, 'close', true); expect(f.store.list<Fill>('fills')).toHaveLength(2);
    expect(new D(closed.pnlIdr!).plus('500000').toFixed()).toBe(f.services.risk.portfolio(p.id).cashIdr);
  } finally { await f.services.close(); }
});
it('does not fabricate fills during gaps, exits at observed gap price, and preserves auto/manual separation', async () => {
  const f = createTradingFixture();
  try {
    await f.warmup(); const experiment = f.services.settings.create({ fxUsdIdr: '16000', activate: true });
    f.services.paper.tick(); expect(f.store.list('entry_requests')).toHaveLength(1);
    await f.observe('1.066'); const position = f.store.list<Position>('positions')[0]!;
    expect(position.portfolioId).toBe(experiment.portfolios[0]!.id);
    f.clock.advance(91_000); f.services.paper.tick(); expect(f.services.paper.position(position.id).state).toBe('UNPRICED'); expect(f.store.list('fills')).toHaveLength(1);
    await f.observe('0.8', 1000); const closed = f.services.paper.position(position.id);
    expect(closed.state).toBe('CLOSED'); expect(closed.qualityFlags).toContain('DATA_GAP');
    const sell = f.store.list<Fill>('fills', "side='SELL'")[0]!; expect(sell.observedPrice).toBe('0.8'); expect(sell.observedPrice).not.toBe(position.stopPrice);
    expect(f.services.risk.portfolio(experiment.portfolios[1]!.id).cashIdr).toBe('500000');
  } finally { await f.services.close(); }
});
it('rolls back a failed fill and releases reservations when an entry expires', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(), p = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
    const entry = f.services.paper.request(signal.id, p.id, 'crash');
    f.store.db.exec("CREATE TRIGGER fixture_crash BEFORE INSERT ON fills BEGIN SELECT RAISE(ABORT,'fixture crash'); END;");
    await expect(f.observe('1.066')).rejects.toThrow('fixture crash');
    expect(f.store.list('positions')).toHaveLength(0); expect(f.services.risk.portfolio(p.id).cashIdr).toBe('500000'); expect(f.services.paper.entry(entry.id).state).toBe('PENDING');
    f.store.db.exec('DROP TRIGGER fixture_crash'); f.clock.advance(600_000); f.services.paper.tick();
    expect(f.services.paper.entry(entry.id).state).toBe('EXPIRED'); expect(f.services.risk.valuation(p.id).reservedCashIdr).toBe('0');
  } finally { await f.services.close(); }
});

it.each(['TARGET','TIME','SECURITY'] as const)('processes %s exit on a fresh observation with deterministic priority', async (reason) => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(), p = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
    const entry = f.services.paper.request(signal.id, p.id, 'entry'); await f.observe('1.066'); const id = f.services.paper.entry(entry.id).positionId!;
    if (reason === 'TIME') f.clock.advance(240 * 60_000);
    if (reason === 'SECURITY') {
      f.clock.advance(1); const old = f.services.security.latest(f.token.id)!;
      const check: SecurityCheck = { ...old, id: f.store.id(), checkedAt: f.store.now(), status: 'FAIL' };
      f.store.put('security_checks', check, { token_id: f.token.id, checked_at: check.checkedAt }, true); f.services.paper.securityChanged(f.token.id);
      expect(f.services.paper.position(id).state).toBe('OPEN');
    }
    await f.observe(reason === 'TIME' ? '1.066' : '2');
    expect(f.services.paper.position(id).exitReason).toBe(reason);
    expect(f.store.list('fills')).toHaveLength(2);
  } finally { await f.services.close(); }
});
