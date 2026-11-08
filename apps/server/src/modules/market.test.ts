import { afterEach, expect, it } from 'vitest';
import { FakeClock } from '@memecoin/domain';
import type { Bar, Snapshot } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { MarketService } from './market.ts';
import type { DexPair } from '../adapters/dex.ts';
import { DexAdapter } from '../adapters/dex.ts';
import { HttpClient } from '../adapters/http.ts';
import { Scheduler } from '../jobs/scheduler.ts';

export const fixtureMint = 'So11111111111111111111111111111111111111112';
const address = '11111111111111111111111111111111';
const alternative = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function fixture() {
  const clock = new FakeClock('2026-10-22T00:00:00.000Z'); const store = new Store(':memory:', clock); stores.push(store);
  const pair: DexPair = { chainId: 'solana', dexId: 'raydium', pairAddress: address, baseToken: { address: fixtureMint }, quoteToken: { address: alternative }, priceUsd: '1', liquidity: { usd: '1000000' }, volume: { h24: '1000000', m5: '500' }, txns: { m5: { buys: 12, sells: 8 }, h1: { buys: 100, sells: 90 } }, pairCreatedAt: Date.parse('2026-10-20T00:00:00Z') };
  let pairs = [pair];
  const market = new MarketService(store, { tokens: async () => pairs, pairs: async () => pairs });
  market.add({ mint: fixtureMint });
  return { clock, store, market, pair, setPairs: (next: DexPair[]) => { pairs = next; } };
}
it('stores buy/sell txn counts and exposes txn series with leader', async () => {
  const { market } = fixture();
  await market.collect();
  const series = market.txnSeries(fixtureMint);
  expect(series.points).toHaveLength(1);
  expect(series.latest?.leaderM5).toBe('BUY');
  const snap = market.latest(market.token(fixtureMint).canonicalPoolId!)!;
  expect(snap.txnsM5Buys).toBe(12);
  expect(snap.txnsM5Sells).toBe(8);
});

it('builds only observed sample bars, deduplicates retries and never sums rolling volume', async () => {
  const { clock, store, market } = fixture();
  await market.collect(); await market.collect();
  expect(store.list<Snapshot>('market_snapshots')).toHaveLength(1);
  clock.advance(30_000); await market.collect();
  expect(market.series(fixtureMint).bars[0]!.complete).toBe(false);
  clock.advance(30_000); await market.collect();
  const bar = market.series(fixtureMint).bars[0]!;
  expect(bar.complete).toBe(true); expect(bar.sampleCount).toBe(2); expect(bar).not.toHaveProperty('volume');
  clock.advance(91_000); expect(market.detail(fixtureMint).stale).toBe(true);
  await market.collect(); expect(market.series(fixtureMint).gaps).toHaveLength(1);
  expect(market.token(fixtureMint).warmupSince).toBe(clock.now().toISOString());
});
it('restarts warmup when canonical pool changes and keeps locked positions monitored', async () => {
  const { clock, market, pair, setPairs, store } = fixture(); await market.collect();
  const original = market.token(fixtureMint).canonicalPoolId!;
  const token = market.token(fixtureMint);
  store.put('signals', { id: store.id(), poolId: original }, { token_id: token.id, pool_id: original, state: 'VALID', expires_at: store.now() });
  clock.advance(600_000); setPairs([{ ...pair, pairAddress: alternative, liquidity: { usd: '2000000' } }, pair]); await market.collect();
  expect(market.token(fixtureMint).canonicalPoolId).not.toBe(original);
  market.remove(fixtureMint); expect(market.monitoredTokens()).toHaveLength(1);
  expect(store.list<Bar>('sample_bars').some((bar) => bar.poolId === original)).toBe(true);
});
it('filters malformed/foreign pools rather than creating valid zero-price data', async () => {
  const { pair } = fixture();
  const http = new HttpClient({ fetch: async () => new Response(JSON.stringify([{ ...pair, chainId: 'ethereum' }, { ...pair, priceUsd: 'NaN' }, { ...pair, liquidity: null }, pair])) });
  expect(await new DexAdapter(http).tokens([fixtureMint])).toEqual([pair]);
  await expect(new DexAdapter(new HttpClient({ fetch: async () => new Response('null') })).tokens([fixtureMint])).rejects.toThrow();
});
it('honors Retry-After, rejects timeout, and bounds request budget', async () => {
  const clock = new FakeClock('2026-10-22T00:00:00Z'); let calls = 0; const waits: number[] = [];
  const http = new HttpClient({ clock, random: () => 0, budget: 3, wait: async (ms) => { waits.push(ms); clock.advance(ms); }, fetch: async () => { calls++; return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } }) : new Response('{}'); } });
  await http.json('https://fixture.test'); expect(waits).toEqual([2000]); await http.json('https://fixture.test');
  await expect(http.json('https://fixture.test')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  const timeout = new HttpClient({ fetch: async () => { throw new Error('timeout'); }, wait: async () => undefined });
  await expect(timeout.json('https://fixture.test')).rejects.toMatchObject({ code: 'NETWORK_TIMEOUT' });
});
it('never overlaps a scheduler job and persists sanitized checkpoints', async () => {
  const { store } = fixture(); const scheduler = new Scheduler(store);
  let finish: (() => void) | undefined; let runs = 0;
  scheduler.add('fixture', () => 30_000, async () => { runs++; await new Promise<void>((resolve) => { finish = resolve; }); });
  const pending = scheduler.tick(); await scheduler.tick(); expect(runs).toBe(1); finish!(); await pending;
  expect(store.get<{ lastSucceededAt: string }>('job_state', 'fixture')!.lastSucceededAt).toBe(store.now());
  await scheduler.stop();
});
