import { D } from './decimal.js';

export interface StrategyBar { openAt: string; closeAt: string; firstObservedAt: string; lastObservedAt: string; sampleCount: number; close: string; complete: boolean; gap: boolean }
export interface FlowPoint { observedAt: string; volumeM5Usd: string | null; buysM5: number | null; sellsM5: number | null }
export const strategyParameters = {
  warmup: 21, staleSeconds: 90, securitySeconds: 600, minimumLiquidityUsd: '5000', minimumVolumeUsd: '5000', poolAgeHours: 1,
  emaFast: 9, emaSlow: 21, momentumBars: 15, momentum: '0.01', pullbackMin: '0.005', pullbackMax: '0.12',
  stopBuffer: '0.99', stopMin: '0.01', stopMax: '0.25', entryHigh: '1.02', expirySeconds: 600, cooldownMinutes: 5, maxHoldMinutes: 240,
  volumeSpikeMultiple: '4', volumeLookbackMs: 1_800_000, volumeRecentMs: 300_000, minBaselinePoints: 8,
  dipPullbackMin: '0.30', dipPullbackMax: '0.50', consolidateBars: 30, consolidateMaxRange: '0.15', dipLookbackBars: 120,
};
export function ema(values: string[], period: number): (string | null)[] {
  if (period < 1 || !Number.isInteger(period)) throw new Error('Periode EMA invalid.');
  const result: (string | null)[] = values.map(() => null); if (values.length < period) return result;
  let current = values.slice(0, period).reduce((sum, value) => sum.plus(value), new D(0)).div(period);
  result[period - 1] = current.toFixed(); const alpha = new D(2).div(period + 1);
  for (let i = period; i < values.length; i++) { current = new D(values[i]!).minus(current).mul(alpha).plus(current); result[i] = current.toFixed(); }
  return result;
}
export interface StrategyInput {
  now: string; warmupSince: string; bars: StrategyBar[]; flow?: FlowPoint[];
  observedAt: string; sourceAt: string | null; priceUsd: string; liquidityUsd: string; volume24hUsd: string | null; poolCreatedAt: string;
  securityStatus: 'PASS' | 'FAIL' | 'UNKNOWN'; securityCheckedAt: string; securityExpiresAt: string;
  lastSignalAt: string | null; hasValidSignal: boolean;
}

function contiguous(bars: StrategyBar[], warmupSince: string, now: number) {
  const filtered = bars.filter((b) => b.openAt >= warmupSince && Date.parse(b.closeAt) <= now && Date.parse(b.lastObservedAt) <= now).sort((a, b) => a.openAt.localeCompare(b.openAt));
  let start = 0;
  for (let i = 0; i < filtered.length; i++) {
    const bar = filtered[i]!, prev = filtered[i - 1];
    if (!bar.complete || bar.sampleCount < 2 || bar.gap) start = i + 1;
    else if (prev && (bar.openAt !== prev.closeAt || Date.parse(bar.firstObservedAt) - Date.parse(prev.lastObservedAt) > 90_000)) start = i;
  }
  return filtered.slice(start);
}

function mean(values: Array<InstanceType<typeof D>>) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum.plus(v), new D(0)).div(values.length);
}

function momentumTrigger(flow: FlowPoint[], now: number, cfg: typeof strategyParameters) {
  const recent = flow.filter((p) => { const age = now - Date.parse(p.observedAt); return age >= 0 && age <= cfg.volumeRecentMs && p.volumeM5Usd; });
  const baseline = flow.filter((p) => { const age = now - Date.parse(p.observedAt); return age > cfg.volumeRecentMs && age <= cfg.volumeLookbackMs && p.volumeM5Usd; });
  const current = recent.length ? D.max(...recent.map((p) => p.volumeM5Usd!)) : null;
  const avg = mean(baseline.map((p) => new D(p.volumeM5Usd!)));
  const ratio = current && avg && avg.gt(0) ? current.div(avg) : null;
  const last = [...flow].reverse().find((p) => p.buysM5 != null && p.sellsM5 != null && now - Date.parse(p.observedAt) <= cfg.volumeRecentMs);
  const pressure = last ? last.buysM5! > last.sellsM5! : false;
  const spike = !!(ratio && baseline.length >= cfg.minBaselinePoints && current && ratio.gte(cfg.volumeSpikeMultiple));
  return {
    ok: spike && pressure,
    spike, pressure,
    volumeRatio: ratio?.toFixed() ?? null,
    baselinePoints: String(baseline.length),
    buysM5: last?.buysM5 != null ? String(last.buysM5) : null,
    sellsM5: last?.sellsM5 != null ? String(last.sellsM5) : null,
  };
}

function dipTrigger(sequence: StrategyBar[], flow: FlowPoint[], now: number, cfg: typeof strategyParameters) {
  const need = cfg.consolidateBars + 10;
  if (sequence.length < need) return { ok: false, pullback: null, range: null, pressure: false, reason: 'DIP_HISTORY_SHORT' };
  const consol = sequence.slice(-cfg.consolidateBars);
  const prior = sequence.slice(Math.max(0, sequence.length - cfg.dipLookbackBars), -cfg.consolidateBars);
  if (!prior.length) return { ok: false, pullback: null, range: null, pressure: false, reason: 'DIP_HISTORY_SHORT' };
  const high = D.max(...prior.map((b) => b.close));
  const last = new D(sequence.at(-1)!.close);
  const pullback = high.gt(0) ? new D(1).minus(last.div(high)) : null;
  const cMax = D.max(...consol.map((b) => b.close)), cMin = D.min(...consol.map((b) => b.close));
  const range = cMin.gt(0) ? cMax.minus(cMin).div(cMin) : null;
  const panic = consol.some((b, i) => i > 0 && new D(b.close).div(consol[i - 1]!.close).lt('0.85'));
  const lastFlow = [...flow].reverse().find((p) => p.buysM5 != null && p.sellsM5 != null && now - Date.parse(p.observedAt) <= cfg.volumeRecentMs);
  const pressure = lastFlow ? lastFlow.buysM5! > lastFlow.sellsM5! : false;
  const pullbackOk = !!(pullback && pullback.gte(cfg.dipPullbackMin) && pullback.lte(cfg.dipPullbackMax));
  const consolOk = !!(range && range.lte(cfg.consolidateMaxRange) && !panic);
  return { ok: pullbackOk && consolOk && pressure, pullback: pullback?.toFixed() ?? null, range: range?.toFixed() ?? null, pressure, panic };
}

export function evaluateStrategy(input: StrategyInput) {
  const cfg = strategyParameters, now = Date.parse(input.now), reasons: string[] = [];
  if ([input.observedAt, input.sourceAt ?? input.observedAt].some((time) => Date.parse(time) > now || now - Date.parse(time) > cfg.staleSeconds * 1000)) reasons.push('STALE_MARKET');
  if (input.securityStatus === 'FAIL') reasons.push('SECURITY_FAIL');
  else if (input.securityStatus !== 'PASS' || Date.parse(input.securityCheckedAt) > now || now >= Date.parse(input.securityExpiresAt) || now - Date.parse(input.securityCheckedAt) > 600_000) reasons.push('SECURITY_UNKNOWN');
  if (now - Date.parse(input.poolCreatedAt) < cfg.poolAgeHours * 3600_000) reasons.push('POOL_TOO_YOUNG');
  if (new D(input.liquidityUsd).lt(cfg.minimumLiquidityUsd)) reasons.push('LIQUIDITY_LOW');
  if (input.volume24hUsd === null || new D(input.volume24hUsd).lt(cfg.minimumVolumeUsd)) reasons.push('VOLUME_LOW');
  if (input.hasValidSignal) reasons.push('ACTIVE_SIGNAL');
  if (input.lastSignalAt && now - Date.parse(input.lastSignalAt) < cfg.cooldownMinutes * 60_000) reasons.push('COOLDOWN');
  const sequence = contiguous(input.bars, input.warmupSince, now);
  if (sequence.length < cfg.warmup || !sequence.length || now - Date.parse(sequence.at(-1)!.closeAt) > 90_000) reasons.push('WARMUP_REQUIRED');
  const flow = (input.flow ?? []).filter((p) => Date.parse(p.observedAt) <= now);
  const momentum = momentumTrigger(flow, now, cfg);
  const dip = dipTrigger(sequence, flow, now, cfg);
  const triggered = momentum.ok || dip.ok;
  if (sequence.length >= cfg.warmup && !triggered) {
    if (!momentum.ok) reasons.push(momentum.spike ? 'BUY_PRESSURE_MISSING' : 'VOLUME_SPIKE_MISSING');
    if (!dip.ok) reasons.push('DIP_REBOUND_MISSING');
  }
  let entry: { lowUsd: string; highUsd: string; stopUsd: string } | null = null;
  const close = sequence.length ? new D(sequence.at(-1)!.close) : null;
  if (close && sequence.length >= 6) {
    const stop = D.min(...sequence.slice(-6, -1).map((b) => b.close)).mul(cfg.stopBuffer);
    entry = { lowUsd: close.toFixed(), highUsd: close.mul(cfg.entryHigh).toFixed(), stopUsd: stop.toFixed() };
  }
  const indicators: Record<string, string> = {
    mode: momentum.ok ? 'MOMENTUM_BREAKOUT' : dip.ok ? 'DIP_REBOUND' : 'NONE',
    volumeRatio: momentum.volumeRatio ?? 'null',
    volumeSpike: String(momentum.spike),
    buyPressure: String(momentum.pressure || dip.pressure),
    buysM5: momentum.buysM5 ?? 'null',
    sellsM5: momentum.sellsM5 ?? 'null',
    dipPullback: dip.pullback ?? 'null',
    dipRange: dip.range ?? 'null',
    close: close?.toFixed() ?? 'null',
    holderGrowth: 'UNAVAILABLE',
    smartWallets: 'UNAVAILABLE',
  };
  return { eligible: reasons.length === 0 && triggered && !!entry, reasonCodes: [...new Set(reasons)], entry, indicators, barCloseAt: sequence.at(-1)?.closeAt ?? null };
}
