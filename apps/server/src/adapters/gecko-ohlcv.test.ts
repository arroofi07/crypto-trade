import { expect, it } from 'vitest';
import { HttpClient } from './http.ts';
import { candlesToBars, GeckoOhlcvAdapter } from './gecko-ohlcv.ts';

it('mengurutkan candle dan menandai gap menit yang hilang', () => {
  const bars = candlesToBars([
    [1_700_000_120, 1, 1, 1, 1.2, 10],
    [1_700_000_000, 1, 1, 1, 1.0, 10],
  ]);
  expect(bars).toHaveLength(2);
  expect(bars[0]!.close).toBe('1');
  expect(bars[1]!.gap).toBe(true);
  expect(bars[1]!.sampleCount).toBe(2);
});

it('mem-parse payload GeckoTerminal dan menolak skema rusak', async () => {
  const http = new HttpClient({
    fetch: async () => new Response(JSON.stringify({
      data: { attributes: { ohlcv_list: [[1_700_000_000, 1, 1.1, 0.9, 1.05, 50]] } },
    })),
  });
  const bars = await new GeckoOhlcvAdapter(http).candles('11111111111111111111111111111111');
  expect(bars).toHaveLength(1);
  expect(bars[0]!.close).toBe('1.05');
  const bad = new GeckoOhlcvAdapter(new HttpClient({ fetch: async () => new Response('{"hello":1}') }));
  await expect(bad.candles('11111111111111111111111111111111')).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
});
