export function usdPrice(value: string | null | undefined) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(n);
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toPrecision(4)}`;
}

export function usdCompact(value: string | null | undefined) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

export function pctChange(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function pctClass(value: string | null | undefined) {
  if (value == null) return 'pct-flat';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'pct-flat';
  return n > 0 ? 'pct-up' : 'pct-down';
}

export function dexLabel(id: string) {
  return { raydium: 'Raydium', orca: 'Orca', meteora: 'Meteora', pumpswap: 'PumpSwap' }[id] ?? id;
}

export const time = (value: string | null | undefined) => value
  ? `${new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Bangkok', hour12: false })} UTC+7`
  : 'Belum tersedia';
