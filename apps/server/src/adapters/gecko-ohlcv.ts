import { z } from 'zod';
import { mintSchema } from '@memecoin/contracts';
import type { StrategyBar } from '@memecoin/domain';
import { HttpClient, ProviderError } from './http.ts';

const rowSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]);
const payloadSchema = z.object({
  data: z.object({ attributes: z.object({ ohlcv_list: z.array(z.unknown()) }) }),
});

export interface OhlcvAdapter { candles(poolAddress: string): Promise<StrategyBar[]> }

export function candlesToBars(rows: Array<[number, number, number, number, number, number]>): StrategyBar[] {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const bars: StrategyBar[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [t, , , , close] = sorted[i]!;
    const ms = t > 1e12 ? t : t * 1000;
    if (!Number.isFinite(ms) || !Number.isFinite(close) || close <= 0) continue;
    const openAt = new Date(ms).toISOString(), closeAt = new Date(ms + 60_000).toISOString();
    const prev = bars.at(-1);
    const gap = !!prev && prev.closeAt !== openAt;
    bars.push({ openAt, closeAt, firstObservedAt: openAt, lastObservedAt: new Date(ms + 30_000).toISOString(), sampleCount: 2, close: String(close), complete: true, gap });
  }
  return bars;
}

export class GeckoOhlcvAdapter implements OhlcvAdapter {
  constructor(private readonly http = new HttpClient({ budget: 8, timeoutMs: 10_000 })) {}
  async candles(poolAddress: string): Promise<StrategyBar[]> {
    mintSchema.parse(poolAddress);
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/minute?aggregate=1&limit=120&currency=usd`;
    const payload = await this.http.json(url, { headers: { Accept: 'application/json', 'User-Agent': 'memecoin-trade-local/0.1' } });
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderError('INVALID_SCHEMA');
    const rows = parsed.data.data.attributes.ohlcv_list.flatMap((item) => {
      const row = rowSchema.safeParse(item);
      return row.success ? [row.data] : [];
    });
    return candlesToBars(rows);
  }
}
