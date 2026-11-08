import { newsInputSchema, newsSchema } from '@memecoin/contracts';
import type { NewsItem, NewsLink, Token } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { RssAdapter, canonicalUrl, plainText } from '../adapters/rss.ts';
import type { RssArticle } from '../adapters/rss.ts';
import { MarketService } from './market.ts';

export class NewsService {
  readonly store: Store; readonly market: MarketService; readonly adapter: RssAdapter;
  constructor(store: Store, market: MarketService, adapter = new RssAdapter()) { this.store = store; this.market = market; this.adapter = adapter; }
  add(input: unknown) {
    const request = newsInputSchema.parse(input); if (request.mint) this.market.token(request.mint);
    return this.persist({ url: request.url, title: request.title, publishedAt: null, publisher: new URL(request.url).hostname }, 'manual', request.mint);
  }
  persist(article: RssArticle, source: 'manual' | 'rss', manualMint?: string) {
    return this.store.transaction(() => {
      const url = canonicalUrl(article.url), title = plainText(article.title);
      const existing = this.store.list<NewsItem>('news_items', 'canonical_url=?', [url])[0];
      if (existing) return existing;
      const links: { token: Token; method: NewsLink['matchMethod']; status: NewsLink['confidenceLabel'] }[] = [];
      for (const token of this.market.tokens()) {
        const exactMint = new RegExp(`(^|[^1-9A-HJ-NP-Za-km-z])${token.mint}([^1-9A-HJ-NP-Za-km-z]|$)`).test(title);
        const symbol = token.symbol?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const symbolMatch = symbol && new RegExp(`(^|[^a-zA-Z0-9])${symbol}([^a-zA-Z0-9]|$)`, 'i').test(title);
        if (manualMint === token.mint || exactMint || symbolMatch) links.push({ token, method: source === 'manual' ? 'MANUAL' : exactMint ? 'MINT' : 'SYMBOL', status: source === 'rss' && exactMint ? 'EXACT_REFERENCE' : 'UNVERIFIED_MATCH' });
      }
      const status = links.some((l) => l.status === 'EXACT_REFERENCE') ? 'EXACT_REFERENCE' : source === 'manual' || links.length ? 'UNVERIFIED_MATCH' : 'MARKET_CONTEXT';
      const item = newsSchema.parse({ id: this.store.id(), canonicalUrl: url, title, publisher: article.publisher, excerpt: '', publishedAt: article.publishedAt, firstSeenAt: this.store.now(), source, matchStatus: status, summary: source === 'manual' ? 'Link manual, belum diverifikasi. Tidak ada klaim dampak harga.' : 'Metadata penerbit; kecocokan identitas bukan bukti dampak harga.' });
      this.store.put('news_items', item, { canonical_url: url }, true);
      for (const link of links) {
        const value: NewsLink = { id: this.store.id(), newsId: item.id, tokenId: link.token.id, matchMethod: link.method, confidenceLabel: link.status, firstSeenAt: this.store.now() };
        this.store.put('news_token_links', value, { news_id: item.id, token_id: link.token.id }, true);
      }
      return item;
    });
  }
  list(mint?: string, at = this.store.now()) {
    const token = mint ? this.market.token(mint) : null;
    const links = token ? this.store.list<NewsLink>('news_token_links', 'token_id=?', [token.id]).filter((link) => link.firstSeenAt <= at) : [];
    return this.store.list<NewsItem>('news_items').filter((n) => n.firstSeenAt <= at && (!token || links.some((l) => l.newsId === n.id))).sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id)).map((item) => ({ ...item, matchStatus: token ? links.find((l) => l.newsId === item.id)!.confidenceLabel : item.matchStatus }));
  }
  async refresh() { for (const article of await this.adapter.collect()) this.persist(article, 'rss'); }
}
