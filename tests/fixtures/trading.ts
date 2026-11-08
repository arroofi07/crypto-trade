import { FakeClock, D } from '../../packages/domain/dist/index.js';
import type { SecurityEvidence } from '../../packages/domain/dist/index.js';
import { Store } from '../../apps/server/src/db/store.ts';
import { Services } from '../../apps/server/src/modules/services.ts';
import type { DexPair } from '../../apps/server/src/adapters/dex.ts';

export const mint = 'So11111111111111111111111111111111111111112';
export const securityEvidence: SecurityEvidence = { program: 'token', initialized: true, decimals: 6, supplyRaw: '1000000000000', mintAuthority: false, freezeAuthority: false, extensions: [], accounts: Array.from({ length: 10 }, (_, i) => ({ address: `verified-fixture-${i}`, amountRaw: '40000000000', role: 'HOLDER', verified: true })), source: 'fixture-classification-only', slot: '123' };
export function positiveCloses() { return [...Array.from({ length: 55 }, (_, i) => new D('0.9').plus(new D(i).mul('0.003')).toFixed()), '1.06', '1.05', '1.04', '1.02', '1.065']; }
export function createTradingFixture(path = ':memory:') {
  const clock = new FakeClock('2026-10-22T00:00:00.000Z');
  const store = new Store(path, clock);
  let pair: DexPair = { chainId: 'solana', dexId: 'raydium', pairAddress: '11111111111111111111111111111111', baseToken: { address: mint, name: 'Fixture Token', symbol: 'TEST' }, quoteToken: { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, priceUsd: '0.9', liquidity: { usd: '1000000' }, volume: { h24: '1000000', m5: '1000' }, txns: { m5: { buys: 40, sells: 35 }, h1: { buys: 400, sells: 380 } }, pairCreatedAt: Date.parse('2026-10-20T00:00:00Z') };
  const services = new Services(store, { market: { tokens: async () => [pair], pairs: async () => [pair] }, security: { inspect: async () => securityEvidence } });
  const token = services.market.add({ mint });
  async function observe(price: string, advance = 30_000) { clock.advance(advance); pair = { ...pair, priceUsd: price }; await services.market.collect(); }
  async function warmup() {
    const closes = positiveCloses();
    for (let i = 0; i < closes.length; i++) {
      pair = { ...pair, priceUsd: closes[i]! }; await services.market.collect(); clock.advance(30_000); await services.market.collect(); clock.advance(30_000);
    }
    pair = { ...pair, priceUsd: closes.at(-1)! }; await services.market.collect();
    await services.security.inspect(token, true); services.signals.evaluate();
    return services.signals.list()[0]!;
  }
  return { clock, store, services, token, observe, warmup };
}
