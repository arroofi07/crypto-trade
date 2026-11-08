import { expect, it } from 'vitest';
import { ema, evaluateStrategy } from './strategy.js';
import type { FlowPoint, StrategyInput } from './strategy.js';

function flow(nowMs: number, spike = true): FlowPoint[] {
  return Array.from({ length: 61 }, (_, i) => {
    const age = (60 - i) * 30_000, recent = age <= 240_000;
    return { observedAt: new Date(nowMs - age).toISOString(), volumeM5Usd: spike && recent ? '800' : '150', buysM5: spike && recent ? 90 : 20, sellsM5: spike && recent ? 20 : 25 };
  });
}
function input(spike = true): StrategyInput {
  const prices = [...Array.from({ length: 55 }, (_, i) => (0.9 + i * 0.003).toFixed(3)), '1.06', '1.05', '1.04', '1.02', '1.065'];
  const start = Date.parse('2026-10-22T00:00:00Z'), nowMs = start + 3600_000, now = new Date(nowMs).toISOString();
  return {
    now, warmupSince: new Date(start).toISOString(),
    bars: prices.map((close, i) => ({ openAt: new Date(start + i * 60_000).toISOString(), closeAt: new Date(start + (i + 1) * 60_000).toISOString(), firstObservedAt: new Date(start + i * 60_000).toISOString(), lastObservedAt: new Date(start + i * 60_000 + 30_000).toISOString(), sampleCount: 2, close, complete: true, gap: false })),
    flow: flow(nowMs, spike), observedAt: now, sourceAt: null, priceUsd: '1.065', liquidityUsd: '1000000', volume24hUsd: '1000000', poolCreatedAt: '2026-10-20T00:00:00Z',
    securityStatus: 'PASS', securityCheckedAt: now, securityExpiresAt: new Date(start + 4200_000).toISOString(), lastSignalAt: null, hasValidSignal: false,
  };
}
it('seeds EMA and fires momentum breakout when 5m volume spikes 4x with buy pressure', () => {
  expect(ema(['1', '2', '3', '4'], 3)).toEqual([null, null, '2', '3']);
  const request = input(); const result = evaluateStrategy(request);
  expect(result.eligible).toBe(true); expect(result.indicators.mode).toBe('MOMENTUM_BREAKOUT');
  expect(evaluateStrategy(request)).toEqual(result);
  expect(evaluateStrategy({ ...request, bars: request.bars.slice(40) }).reasonCodes).toContain('WARMUP_REQUIRED');
  expect(evaluateStrategy({ ...request, now: '2026-10-22T00:59:59.999Z' }).eligible).toBe(false);
});
it('blocks fail/stale data, cooldown, and missing volume spike; dip rebound needs 30–50% pullback', () => {
  const request = input();
  expect(evaluateStrategy({ ...request, securityStatus: 'UNKNOWN' }).reasonCodes).toContain('SECURITY_UNKNOWN');
  expect(evaluateStrategy({ ...request, securityStatus: 'UNKNOWN' }).eligible).toBe(false);
  expect(evaluateStrategy({ ...request, securityStatus: 'FAIL' }).reasonCodes).toContain('SECURITY_FAIL');
  expect(evaluateStrategy({ ...request, securityExpiresAt: request.now }).reasonCodes).toContain('SECURITY_UNKNOWN');
  expect(evaluateStrategy({ ...request, sourceAt: '2026-10-22T00:58:29Z' }).reasonCodes).toContain('STALE_MARKET');
  expect(evaluateStrategy({ ...request, hasValidSignal: true, lastSignalAt: request.now }).reasonCodes).toEqual(expect.arrayContaining(['ACTIVE_SIGNAL', 'COOLDOWN']));
  expect(evaluateStrategy(input(false)).reasonCodes).toEqual(expect.arrayContaining(['VOLUME_SPIKE_MISSING', 'DIP_REBOUND_MISSING']));
});
it('fires dip rebound after 30–50% pullback, 30m consolidation, and 5m buy pressure', () => {
  const start = Date.parse('2026-10-22T00:00:00Z'), nowMs = start + 90 * 60_000, now = new Date(nowMs).toISOString();
  const prices = [...Array.from({ length: 50 }, () => '1.00'), ...Array.from({ length: 10 }, () => '1.80'), ...Array.from({ length: 30 }, () => '1.10')];
  const bars = prices.map((close, i) => ({ openAt: new Date(start + i * 60_000).toISOString(), closeAt: new Date(start + (i + 1) * 60_000).toISOString(), firstObservedAt: new Date(start + i * 60_000).toISOString(), lastObservedAt: new Date(start + i * 60_000 + 30_000).toISOString(), sampleCount: 2, close, complete: true, gap: false }));
  const flowPoints: FlowPoint[] = Array.from({ length: 61 }, (_, i) => {
    const age = (60 - i) * 30_000;
    return { observedAt: new Date(nowMs - age).toISOString(), volumeM5Usd: '200', buysM5: 40, sellsM5: 20 };
  });
  const result = evaluateStrategy({
    now, warmupSince: new Date(start).toISOString(), bars, flow: flowPoints, observedAt: now, sourceAt: null, priceUsd: '1.10', liquidityUsd: '1000000', volume24hUsd: '1000000',
    poolCreatedAt: '2026-10-20T00:00:00Z', securityStatus: 'PASS', securityCheckedAt: now, securityExpiresAt: new Date(nowMs + 600_000).toISOString(), lastSignalAt: null, hasValidSignal: false,
  });
  expect(result.eligible).toBe(true); expect(result.indicators.mode).toBe('DIP_REBOUND');
});
