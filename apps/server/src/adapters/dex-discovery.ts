export const DISCOVERY_FEED_URLS = [
  'https://api.dexscreener.com/token-boosts/latest/v1',
  'https://api.dexscreener.com/token-boosts/top/v1',
  'https://api.dexscreener.com/token-profiles/latest/v1',
  'https://api.dexscreener.com/token-profiles/recent-updates/v1',
  'https://api.dexscreener.com/community-takeovers/latest/v1',
  'https://api.dexscreener.com/ads/latest/v1',
] as const;

export const DISCOVERY_SEARCH_QUERIES = [
  'solana', 'pump', 'raydium', 'orca', 'meteora', 'meme', 'bonk', 'pepe', 'ai', 'dog', 'cat', 'trump', 'usdc', 'wif',
] as const;

export const DISCOVERY_META_BATCH = 5;
export const DISCOVERY_SEARCH_BATCH = 4;
export const DISCOVERY_MAX_MINT_ENRICH = 120;

export type DiscoveryCursor = { metaOffset: number; searchOffset: number };

export const defaultDiscoveryCursor = (): DiscoveryCursor => ({ metaOffset: 0, searchOffset: 0 });
