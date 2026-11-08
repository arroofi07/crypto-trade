import { expect, it } from 'vitest';
import { ema, evaluateStrategy } from './strategy.js';
import type { StrategyInput } from './strategy.js';

function input(): StrategyInput {
  const prices = [...Array.from({ length: 55 }, (_, i) => (0.9 + i * 0.003).toFixed(3)), '1.06','1.05','1.04','1.02','1.065'];
  const start = Date.parse('2026-10-22T00:00:00Z'), now = new Date(start + 3600_000).toISOString();
  return { now, warmupSince: new Date(start).toISOString(), bars: prices.map((close, i) => ({ openAt: new Date(start + i * 60_000).toISOString(), closeAt: new Date(start + (i + 1) * 60_000).toISOString(), firstObservedAt: new Date(start + i * 60_000).toISOString(), lastObservedAt: new Date(start + i * 60_000 + 30_000).toISOString(), sampleCount: 2, close, complete: true, gap: false })), observedAt: now, sourceAt: null, priceUsd: '1.065', liquidityUsd: '1000000', volume24hUsd: '1000000', poolCreatedAt: '2026-10-20T00:00:00Z', securityStatus: 'PASS', securityCheckedAt: now, securityExpiresAt: new Date(start + 4200_000).toISOString(), lastSignalAt: null, hasValidSignal: false };
}
it('seeds EMA with SMA and emits the deterministic positive trigger only after 60 closed bars', () => {
  expect(ema(['1','2','3','4'], 3)).toEqual([null,null,'2','3']);
  const request = input(); const result = evaluateStrategy(request);
  expect(result.eligible).toBe(true); expect(result.entry?.stopUsd).toBe('1.0098');
  expect(evaluateStrategy(request)).toEqual(result);
  expect(evaluateStrategy({ ...request, bars: request.bars.slice(1) }).reasonCodes).toContain('WARMUP_REQUIRED');
  expect(evaluateStrategy({ ...request, now: '2026-10-22T00:59:59.999Z' }).eligible).toBe(false);
});
it('blocks unknown/stale security, stale source data, gaps, active signals, cooldown and invalid recovery', () => {
  const request = input();
  expect(evaluateStrategy({ ...request, securityStatus: 'UNKNOWN' }).reasonCodes).toContain('SECURITY_UNKNOWN');
  expect(evaluateStrategy({ ...request, securityExpiresAt: request.now }).reasonCodes).toContain('SECURITY_UNKNOWN');
  expect(evaluateStrategy({ ...request, sourceAt: '2026-10-22T00:58:29Z' }).reasonCodes).toContain('STALE_MARKET');
  expect(evaluateStrategy({ ...request, bars: request.bars.map((b, i) => ({ ...b, gap: i === 30 })) }).reasonCodes).toContain('WARMUP_REQUIRED');
  expect(evaluateStrategy({ ...request, hasValidSignal: true, lastSignalAt: request.now }).reasonCodes).toEqual(expect.arrayContaining(['ACTIVE_SIGNAL','COOLDOWN']));
  const noRecovery = request.bars.map((b, i) => i === 59 ? { ...b, close: '1.01' } : b);
  expect(evaluateStrategy({ ...request, bars: noRecovery }).reasonCodes).toContain('RECOVERY_MISSING');
});
