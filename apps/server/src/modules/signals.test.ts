import { expect, it } from 'vitest';
import { createTradingFixture } from '../../../../tests/fixtures/trading.ts';
import type { SecurityCheck } from '@memecoin/contracts';

it('publishes one signal per trigger with immutable evidence and expires exactly at the boundary', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(); expect(signal).toBeDefined(); expect(signal.state).toBe('VALID');
    f.services.signals.evaluate(); expect(f.store.list('signals')).toHaveLength(1);
    expect(signal.evidence).toHaveProperty('bars'); expect(signal.evidence).toHaveProperty('security');
    expect(signal).not.toHaveProperty('probability'); expect(f.store.list('decisions')).toHaveLength(1);
    await f.observe('1.065', 300_000); f.clock.advance(300_000);
    expect(f.services.signals.get(signal.id).state).toBe('EXPIRED');
    expect(f.store.list('signal_events')).toHaveLength(2);
    expect(f.services.signals.get(signal.id).state).toBe('EXPIRED');
  } finally { await f.services.close(); }
});
it('does not publish a signal unless security is PASS', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(false);
    expect(signal).toBeUndefined();
    expect(f.store.list<{ reasonCodes: string[] }>('decisions').at(-1)?.reasonCodes).toContain('SECURITY_UNKNOWN');
  } finally { await f.services.close(); }
});
it('invalidates on failed security without resurrecting the old signal', async () => {
  const f = createTradingFixture();
  try {
    const signal = await f.warmup(); f.clock.advance(1);
    const original = f.services.security.latest(f.token.id)!;
    const check: SecurityCheck = { ...original, id: f.store.id(), checkedAt: f.store.now(), status: 'FAIL' };
    f.store.put('security_checks', check, { token_id: f.token.id, checked_at: check.checkedAt }, true);
    expect(f.services.signals.get(signal.id).state).toBe('INVALIDATED');
    await f.services.security.inspect(f.token, true);
    expect(f.services.signals.get(signal.id).state).toBe('INVALIDATED');
    expect(f.services.signals.list()).toHaveLength(1);
  } finally { await f.services.close(); }
});
