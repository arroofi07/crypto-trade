import { expect, it } from 'vitest';
import { scoreDiscoveryPair } from './discovery.ts';
import type { DexPair } from '../adapters/dex.ts';

const pair: DexPair = {
  chainId: 'solana', dexId: 'raydium', pairAddress: 'So11111111111111111111111111111111111111112',
  baseToken: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  quoteToken: { address: 'So11111111111111111111111111111111111111112' },
  priceUsd: '1', liquidity: { usd: '150000' }, volume: { h24: '120000' }, pairCreatedAt: Date.parse('2020-01-01T00:00:00Z'),
};

it('menghitung skor aturan tanpa klaim profit', () => {
  const good = scoreDiscoveryPair(pair, Date.parse('2026-11-06T00:00:00Z'));
  expect(good.score).toBeGreaterThan(50);
  expect(good.reasonCodes).toContain('RULES_OK');
  const young = scoreDiscoveryPair({ ...pair, pairCreatedAt: Date.parse('2026-11-06T00:00:00Z') }, Date.parse('2026-11-06T00:30:00Z'));
  expect(young.reasonCodes).toContain('POOL_TOO_YOUNG');
});
