import { expect, it } from 'vitest';
import { DexAdapter } from './dex.ts';
import { HttpClient } from './http.ts';
import { fixtureMint } from '../modules/market.test.ts';

const altMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pool = '11111111111111111111111111111111';
const quote = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function solanaPair(mint: string, liq: string) {
  return { chainId: 'solana', dexId: 'raydium', pairAddress: pool, baseToken: { address: mint, symbol: 'T' }, quoteToken: { address: quote }, priceUsd: '1', liquidity: { usd: liq }, volume: { h24: '200000' }, pairCreatedAt: Date.parse('2026-10-20T00:00:00Z') };
}

it('merges feeds, search, meta and advances discovery cursor', async () => {
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = String(input);
    let body: unknown = [];
    if (url.includes('token-boosts/latest')) body = [{ chainId: 'solana', tokenAddress: fixtureMint }];
    else if (url.includes('metas/trending')) body = [{ slug: 'dog' }, { slug: 'cat' }];
    else if (url.includes('metas/meta/v1/dog')) body = { pairs: [solanaPair(altMint, '50000')] };
    else if (url.includes('latest/dex/search?q=solana')) body = { pairs: [solanaPair(fixtureMint, '250000')] };
    else if (url.includes('tokens/v1/solana')) body = [solanaPair(fixtureMint, '300000')];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const discoveryHttp = new HttpClient({ fetch, budget: 100 });
  const adapter = new DexAdapter(new HttpClient({ fetch, budget: 100 }), discoveryHttp);
  const first = await adapter.discover({ metaOffset: 0, searchOffset: 0 });
  expect(first.pairs.some((p) => p.baseToken.address === fixtureMint && p.source === 'search')).toBe(true);
  expect(first.pairs.find((p) => p.baseToken.address === altMint)?.source).toBe('meta');
  expect(first.cursor.searchOffset).toBeGreaterThan(0);
  const second = await adapter.discover(first.cursor);
  expect(second.cursor.metaOffset).toBeGreaterThanOrEqual(0);
});
