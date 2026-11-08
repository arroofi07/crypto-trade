import { D, sum } from './decimal.js';

export function tradeMetrics(trades: { pnlIdr: string; holdSeconds: number }[]) {
  const wins = trades.filter((t) => new D(t.pnlIdr).gt(0)), losses = trades.filter((t) => new D(t.pnlIdr).lt(0));
  const positive = sum(wins.map((t) => t.pnlIdr)), negative = sum(losses.map((t) => t.pnlIdr)).abs(), net = positive.minus(negative);
  return { closedCount: trades.length, wins: wins.length, losses: losses.length, breakeven: trades.length - wins.length - losses.length, winRate: trades.length ? new D(wins.length).div(trades.length).toFixed() : null, netPnlIdr: net.toFixed(), averageWinIdr: wins.length ? positive.div(wins.length).toFixed() : null, averageLossIdr: losses.length ? negative.div(losses.length).negated().toFixed() : null, expectancyIdr: trades.length ? net.div(trades.length).toFixed() : null, profitFactor: negative.gt(0) ? positive.div(negative).toFixed() : positive.gt(0) ? 'infinity' : 'undefined', averageHoldSeconds: trades.length ? trades.reduce((total, t) => total + t.holdSeconds, 0) / trades.length : null };
}
export function drawdown(points: { observedAt: string; equityIdr: string | null }[], externalGap = false) {
  let peak: InstanceType<typeof D> | null = null, maximum = new D(0), gap = externalGap, previous: string | null = null;
  for (const point of points) {
    if (previous && Date.parse(point.observedAt) - Date.parse(previous) > 90_000) { gap = true; peak = null; }
    previous = point.observedAt;
    if (point.equityIdr === null) { gap = true; peak = null; continue; }
    const equity = new D(point.equityIdr); peak = peak === null ? equity : D.max(peak, equity);
    if (peak.gt(0)) maximum = D.max(maximum, peak.minus(equity).div(peak));
  }
  return { observedDrawdown: points.some((p) => p.equityIdr !== null) ? maximum.toFixed() : null, drawdownUnknownDuringGap: gap };
}
// eslint-disable-next-line no-control-regex -- Spreadsheet formulas can be prefixed by control bytes.
export function csvCell(value: unknown) { let text = value == null ? '' : String(value); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }
