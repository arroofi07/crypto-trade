import type { Pool, Token } from '@memecoin/contracts';
import { warmupProgress, type StrategyBar } from '@memecoin/domain';
import { Store } from '../db/store.ts';
import { GeckoOhlcvAdapter } from '../adapters/gecko-ohlcv.ts';
import type { OhlcvAdapter } from '../adapters/gecko-ohlcv.ts';
import type { MarketService } from './market.ts';

const TTL_MS = 60_000;

export class OhlcvService {
  private readonly cache = new Map<string, { fetchedAt: number; bars: StrategyBar[] }>();
  constructor(readonly store: Store, readonly adapter: OhlcvAdapter = new GeckoOhlcvAdapter()) {}
  bars(poolAddress: string): StrategyBar[] {
    return this.cache.get(poolAddress)?.bars ?? [];
  }
  progress(poolAddress: string) {
    return warmupProgress(this.bars(poolAddress), '1970-01-01T00:00:00.000Z', this.store.now());
  }
  strategyBars(pool: Pool, local: StrategyBar[], warmupSince: string): { bars: StrategyBar[]; warmupSince: string; source: 'geckoterminal' | 'sampled' } {
    const provider = this.bars(pool.address).filter((b) => b.closeAt <= this.store.now());
    if (provider.length >= 21) return { bars: provider, warmupSince: provider[0]!.openAt, source: 'geckoterminal' };
    return { bars: local, warmupSince, source: 'sampled' };
  }
  async refresh(market: MarketService) {
    const now = this.store.clock.now().getTime();
    const tokens = market.monitoredTokens();
    for (const token of tokens) {
      const pool = token.canonicalPoolId ? this.store.get<Pool>('pools', token.canonicalPoolId) : undefined;
      if (!pool) continue;
      const cached = this.cache.get(pool.address);
      if (cached && now - cached.fetchedAt < TTL_MS) continue;
      try {
        const bars = await this.adapter.candles(pool.address);
        this.cache.set(pool.address, { fetchedAt: this.store.clock.now().getTime(), bars });
      } catch {
        if (!cached) this.cache.set(pool.address, { fetchedAt: this.store.clock.now().getTime(), bars: [] });
      }
    }
  }
  preview(token: Token) {
    const pool = token.canonicalPoolId ? this.store.get<Pool>('pools', token.canonicalPoolId) : undefined;
    if (!pool) return { have: 0, need: 21, done: false, source: 'sampled' as const };
    const gecko = this.progress(pool.address);
    if (gecko.have > 0) return { ...gecko, source: 'geckoterminal' as const };
    return { have: 0, need: 21, done: false, source: 'sampled' as const };
  }
}
