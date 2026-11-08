import { z } from 'zod';
import { D } from '@memecoin/domain';
import { mintSchema } from '@memecoin/contracts';
import type { DiscoveryCandidate } from '@memecoin/contracts';
import { HttpClient, ProviderError } from './http.ts';
import {
  DISCOVERY_FEED_URLS, DISCOVERY_MAX_MINT_ENRICH, DISCOVERY_META_BATCH, DISCOVERY_SEARCH_BATCH, DISCOVERY_SEARCH_QUERIES,
  type DiscoveryCursor, defaultDiscoveryCursor,
} from './dex-discovery.ts';

const numeric = z.union([z.string().max(100), z.number()]).transform((v, ctx) => {
  try { const n = new D(v); if (!n.isFinite() || n.isNegative()) throw new Error(); return n.toFixed(); }
  catch { ctx.addIssue({ code: 'custom', message: 'Angka provider invalid.' }); return z.NEVER; }
});
const txnWindowSchema = z.object({ buys: z.number().int().nonnegative(), sells: z.number().int().nonnegative() });
export const pairSchema = z.object({
  chainId: z.literal('solana'), dexId: z.enum(['raydium','orca','meteora','pumpswap']), pairAddress: mintSchema,
  baseToken: z.object({ address: mintSchema, name: z.string().max(200).optional(), symbol: z.string().max(40).optional() }),
  quoteToken: z.object({ address: mintSchema }), priceUsd: numeric.refine((v) => new D(v).gt(0)),
  liquidity: z.object({ usd: numeric.refine((v) => new D(v).gt(0)) }),
  volume: z.object({ h24: numeric.optional(), m5: numeric.optional() }).optional(),
  txns: z.object({ m5: txnWindowSchema.optional(), h1: txnWindowSchema.optional(), h6: txnWindowSchema.optional(), h24: txnWindowSchema.optional() }).optional(),
  pairCreatedAt: z.number().int().nonnegative(),
});
export type DexPair = z.infer<typeof pairSchema>;
export type RankedDiscoveryPair = DexPair & { source: DiscoveryCandidate['source'] };

const tokenRefSchema = z.object({ chainId: z.string(), tokenAddress: mintSchema }).passthrough();

const FEED_SOURCE: Record<string, DiscoveryCandidate['source']> = {
  'https://api.dexscreener.com/token-boosts/latest/v1': 'boost',
  'https://api.dexscreener.com/token-boosts/top/v1': 'boost_top',
  'https://api.dexscreener.com/token-profiles/latest/v1': 'profile',
  'https://api.dexscreener.com/token-profiles/recent-updates/v1': 'profile_update',
  'https://api.dexscreener.com/community-takeovers/latest/v1': 'takeover',
  'https://api.dexscreener.com/ads/latest/v1': 'ads',
};

export interface MarketAdapter {
  tokens(mints: string[]): Promise<DexPair[]>;
  pairs(addresses: string[]): Promise<DexPair[]>;
  discover(cursor?: DiscoveryCursor): Promise<{ pairs: RankedDiscoveryPair[]; cursor: DiscoveryCursor }>;
}
export class DexAdapter implements MarketAdapter {
  readonly http: HttpClient;
  readonly discoveryHttp: HttpClient;
  constructor(http = new HttpClient(), discoveryHttp = new HttpClient({ budget: 45 })) { this.http = http; this.discoveryHttp = discoveryHttp; }
  private parse(payload: unknown): DexPair[] {
    if (!Array.isArray(payload)) throw new ProviderError('INVALID_SCHEMA');
    return payload.flatMap((value) => { const result = pairSchema.safeParse(value); return result.success ? [result.data] : []; });
  }
  private parsePairsPayload(payload: unknown): DexPair[] {
    const envelope = z.object({ pairs: z.array(z.unknown()) }).safeParse(payload);
    if (envelope.success) return this.parse(envelope.data.pairs);
    return this.parse(payload);
  }
  async tokens(mints: string[]) { if (!mints.length) return []; return this.parse(await this.http.json(`https://api.dexscreener.com/tokens/v1/solana/${mints.map((m) => mintSchema.parse(m)).join(',')}`)); }
  async pairs(addresses: string[]) {
    if (!addresses.length) return [];
    const response = await this.http.json(`https://api.dexscreener.com/latest/dex/pairs/solana/${addresses.map((a) => mintSchema.parse(a)).join(',')}`);
    return this.parse(z.object({ pairs: z.array(z.unknown()) }).parse(response).pairs);
  }
  private discoveryMints(payload: unknown) {
    if (!Array.isArray(payload)) return [];
    const mints = new Set<string>();
    for (const item of payload) {
      const row = tokenRefSchema.safeParse(item);
      if (row.success && row.data.chainId === 'solana') mints.add(row.data.tokenAddress);
    }
    return [...mints];
  }
  private async safeJson(url: string) {
    try { return await this.discoveryHttp.json(url); } catch { return null; }
  }
  private pickBest(best: Map<string, RankedDiscoveryPair>, pair: DexPair, source: DiscoveryCandidate['source']) {
    const mint = pair.baseToken.address;
    const row: RankedDiscoveryPair = { ...pair, source };
    const old = best.get(mint);
    if (!old || new D(pair.liquidity.usd).gt(old.liquidity.usd)) best.set(mint, row);
  }
  async discover(cursor = defaultDiscoveryCursor()) {
    const best = new Map<string, RankedDiscoveryPair>();
    const mintSources = new Map<string, DiscoveryCandidate['source']>();
    for (const url of DISCOVERY_FEED_URLS) {
      const payload = await this.safeJson(url);
      if (!payload) continue;
      const source = FEED_SOURCE[url] ?? 'profile';
      for (const mint of this.discoveryMints(payload)) {
        if (!mintSources.has(mint)) mintSources.set(mint, source);
      }
    }
    const metaPayload = await this.safeJson('https://api.dexscreener.com/metas/trending/v1');
    const slugs = z.array(z.object({ slug: z.string() })).catch([]).parse(metaPayload).map((m) => m.slug);
    const metaSlice = slugs.slice(cursor.metaOffset, cursor.metaOffset + DISCOVERY_META_BATCH);
    const nextMetaOffset = slugs.length ? (cursor.metaOffset + DISCOVERY_META_BATCH) % slugs.length : 0;
    for (const slug of metaSlice) {
      const meta = await this.safeJson(`https://api.dexscreener.com/metas/meta/v1/${encodeURIComponent(slug)}`);
      if (!meta) continue;
      for (const pair of this.parsePairsPayload(meta)) this.pickBest(best, pair, 'meta');
    }
    const searches = DISCOVERY_SEARCH_QUERIES;
    const searchSlice = searches.slice(cursor.searchOffset, cursor.searchOffset + DISCOVERY_SEARCH_BATCH);
    const nextSearchOffset = (cursor.searchOffset + DISCOVERY_SEARCH_BATCH) % searches.length;
    for (const query of searchSlice) {
      const payload = await this.safeJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
      if (!payload) continue;
      for (const pair of this.parsePairsPayload(payload)) this.pickBest(best, pair, 'search');
    }
    const enrich = [...mintSources.keys()].filter((m) => !best.has(m)).slice(0, DISCOVERY_MAX_MINT_ENRICH);
    for (let i = 0; i < enrich.length; i += 30) {
      try {
        for (const pair of await this.tokens(enrich.slice(i, i + 30))) {
          const source = mintSources.get(pair.baseToken.address) ?? 'profile';
          this.pickBest(best, pair, source);
        }
      } catch { /* batch opsional */ }
    }
    const pairs = [...best.values()].sort((a, b) => new D(b.liquidity.usd).cmp(a.liquidity.usd) || a.baseToken.address.localeCompare(b.baseToken.address));
    return { pairs, cursor: { metaOffset: nextMetaOffset, searchOffset: nextSearchOffset } };
  }
}
