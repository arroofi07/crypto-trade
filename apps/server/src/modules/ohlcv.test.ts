import { expect, it } from 'vitest';
import { FakeClock } from '@memecoin/domain';
import { Store } from '../db/store.ts';
import { MarketService } from './market.ts';
import { OhlcvService } from './ohlcv.ts';
import { candlesToBars } from '../adapters/gecko-ohlcv.ts';

it('memakai candle GeckoTerminal jika sudah 21 bar, selain itu sampel lokal', async () => {
  const clock = new FakeClock('2026-11-09T00:31:00.000Z');
  const store = new Store(':memory:', clock);
  const market = new MarketService(store, { tokens: async () => [], pairs: async () => [], discover: async () => ({ pairs: [], cursor: { metaOffset: 0, searchOffset: 0 } }) });
  const start = Date.parse('2026-11-09T00:00:00.000Z');
  const rows = Array.from({ length: 30 }, (_, i) => [start / 1000 + i * 60, 1, 1, 1, 1 + i / 100, 1] as [number, number, number, number, number, number]);
  const ohlcv = new OhlcvService(store, { candles: async () => candlesToBars(rows) });
  const token = market.add({ mint: 'So11111111111111111111111111111111111111112' });
  store.put('pools', { id: '11111111-1111-4111-8111-111111111111', tokenId: token.id, address: '11111111111111111111111111111111', provider: 'dexscreener', dexId: 'raydium', quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', createdAtSource: '2026-11-08T00:00:00.000Z' }, { token_id: token.id, address: '11111111111111111111111111111111' });
  market.saveToken({ ...token, canonicalPoolId: '11111111-1111-4111-8111-111111111111' });
  await ohlcv.refresh(market);
  const pool = store.get('pools', '11111111-1111-4111-8111-111111111111')!;
  const series = ohlcv.strategyBars(pool, [], token.warmupSince);
  expect(series.source).toBe('geckoterminal');
  expect(series.bars.length).toBeGreaterThanOrEqual(21);
  expect(ohlcv.preview(market.token(token.mint)).source).toBe('geckoterminal');
  const fallback = new OhlcvService(store, { candles: async () => [] });
  await fallback.refresh(market);
  expect(fallback.strategyBars(pool, [], token.warmupSince).source).toBe('sampled');
});
