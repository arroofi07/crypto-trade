import { D } from './decimal.js';

export interface StrategyBar { openAt: string; closeAt: string; firstObservedAt: string; lastObservedAt: string; sampleCount: number; close: string; complete: boolean; gap: boolean }
export const strategyParameters = { warmup: 21, staleSeconds: 90, securitySeconds: 600, minimumLiquidityUsd: '5000', minimumVolumeUsd: '5000', poolAgeHours: 1, emaFast: 9, emaSlow: 21, momentumBars: 15, momentum: '0.01', pullbackMin: '0.005', pullbackMax: '0.12', stopBuffer: '0.99', stopMin: '0.01', stopMax: '0.20', entryHigh: '1.02', expirySeconds: 600, cooldownMinutes: 5, maxHoldMinutes: 240 };
export function ema(values: string[], period: number): (string | null)[] {
  if (period < 1 || !Number.isInteger(period)) throw new Error('Periode EMA invalid.');
  const result: (string | null)[] = values.map(() => null); if (values.length < period) return result;
  let current = values.slice(0, period).reduce((sum, value) => sum.plus(value), new D(0)).div(period);
  result[period - 1] = current.toFixed(); const alpha = new D(2).div(period + 1);
  for (let i = period; i < values.length; i++) { current = new D(values[i]!).minus(current).mul(alpha).plus(current); result[i] = current.toFixed(); }
  return result;
}
export interface StrategyInput {
  now: string; warmupSince: string; bars: StrategyBar[];
  observedAt: string; sourceAt: string | null; priceUsd: string; liquidityUsd: string; volume24hUsd: string | null; poolCreatedAt: string;
  securityStatus: 'PASS' | 'FAIL' | 'UNKNOWN'; securityCheckedAt: string; securityExpiresAt: string;
  lastSignalAt: string | null; hasValidSignal: boolean;
}
export function evaluateStrategy(input: StrategyInput) {
  const cfg = strategyParameters, now = Date.parse(input.now), reasons: string[] = [];
  if ([input.observedAt, input.sourceAt ?? input.observedAt].some((time) => Date.parse(time) > now || now - Date.parse(time) > cfg.staleSeconds * 1000)) reasons.push('STALE_MARKET');
  if (input.securityStatus === 'FAIL') reasons.push('SECURITY_FAIL');
  else if (input.securityStatus === 'PASS' && (Date.parse(input.securityCheckedAt) > now || now >= Date.parse(input.securityExpiresAt) || now - Date.parse(input.securityCheckedAt) > 600_000)) reasons.push('SECURITY_UNKNOWN');
  if (now - Date.parse(input.poolCreatedAt) < cfg.poolAgeHours * 3600_000) reasons.push('POOL_TOO_YOUNG');
  if (new D(input.liquidityUsd).lt(cfg.minimumLiquidityUsd)) reasons.push('LIQUIDITY_LOW');
  if (input.volume24hUsd === null || new D(input.volume24hUsd).lt(cfg.minimumVolumeUsd)) reasons.push('VOLUME_LOW');
  if (input.hasValidSignal) reasons.push('ACTIVE_SIGNAL');
  if (input.lastSignalAt && now - Date.parse(input.lastSignalAt) < cfg.cooldownMinutes * 60_000) reasons.push('COOLDOWN');
  const bars = input.bars.filter((b) => b.openAt >= input.warmupSince && Date.parse(b.closeAt) <= now && Date.parse(b.lastObservedAt) <= now).sort((a, b) => a.openAt.localeCompare(b.openAt));
  let start = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!, prev = bars[i - 1];
    if (!bar.complete || bar.sampleCount < 2 || bar.gap) start = i + 1;
    else if (prev && (bar.openAt !== prev.closeAt || Date.parse(bar.firstObservedAt) - Date.parse(prev.lastObservedAt) > 90_000)) start = i;
  }
  const sequence = bars.slice(start);
  if (sequence.length < cfg.warmup || !sequence.length || now - Date.parse(sequence.at(-1)!.closeAt) > 90_000) reasons.push('WARMUP_REQUIRED');
  const closes = sequence.map((b) => b.close);
  const fast = ema(closes, 9).at(-1), slow = ema(closes, 21).at(-1);
  let entry: { lowUsd: string; highUsd: string; stopUsd: string } | null = null;
  let indicators: Record<string, string> = {};
  if (sequence.length >= cfg.warmup && fast && slow) {
    const close = new D(closes.at(-1)!), previous = new D(closes.at(-2)!);
    const momentum = close.div(closes.at(-16)!).minus(1);
    const high = D.max(...closes.slice(-11, -1));
    const pullback = new D(1).minus(previous.div(high));
    const stop = D.min(...closes.slice(-6, -1)).mul(cfg.stopBuffer);
    const distance = close.minus(stop).div(close);
    if (!new D(fast).gt(slow) || !close.gt(slow) || momentum.lt(cfg.momentum)) reasons.push('TREND_INVALID');
    if (pullback.lt(cfg.pullbackMin) || pullback.gt(cfg.pullbackMax)) reasons.push('PULLBACK_MISSING');
    if (!close.gt(previous) || close.lt(fast)) reasons.push('RECOVERY_MISSING');
    if (distance.lt(cfg.stopMin) || distance.gt(cfg.stopMax)) reasons.push('STOP_DISTANCE');
    entry = { lowUsd: close.toFixed(), highUsd: close.mul(cfg.entryHigh).toFixed(), stopUsd: stop.toFixed() };
    indicators = { ema9: fast, ema21: slow, momentum15: momentum.toFixed(), pullback: pullback.toFixed(), stopDistance: distance.toFixed(), close: close.toFixed() };
  }
  return { eligible: reasons.length === 0, reasonCodes: [...new Set(reasons)], entry, indicators, barCloseAt: sequence.at(-1)?.closeAt ?? null };
}
