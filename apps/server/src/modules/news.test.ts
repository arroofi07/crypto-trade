import { expect, it } from 'vitest';
import { FakeClock } from '@memecoin/domain';
import { Store } from '../db/store.ts';
import { MarketService } from './market.ts';
import { NewsService } from './news.ts';
import { RssAdapter } from '../adapters/rss.ts';
import { HttpClient } from '../adapters/http.ts';

it('deduplicates canonical URLs, does not fetch manual links, and keeps symbol matches unverified', () => {
  const clock = new FakeClock('2026-10-22T00:00:00Z'), store = new Store(':memory:', clock);
  try {
    const market = new MarketService(store), news = new NewsService(store, market);
    const a = market.add({ mint: 'So11111111111111111111111111111111111111112' });
    const b = market.add({ mint: '11111111111111111111111111111111' });
    market.saveToken({ ...a, symbol: 'SAME' }); market.saveToken({ ...b, symbol: 'SAME' });
    const old = clock.now().toISOString(); clock.advance(1000);
    const article = news.add({ url: 'http://127.0.0.1/private?utm_source=x', title: '<script>alert(1)</script>SAME update', mint: a.mint });
    expect(article.title).toBe('SAME update'); expect(article.publishedAt).toBeNull();
    expect(news.add({ url: 'http://127.0.0.1/private#section', title: 'duplicate' }).id).toBe(article.id);
    expect(news.list(b.mint)[0]!.matchStatus).toBe('UNVERIFIED_MATCH'); expect(news.list(a.mint, old)).toEqual([]);
    expect(() => news.add({ url: 'javascript:alert(1)', title: 'bad' })).toThrow();
    expect(news.persist({ url: 'https://publisher.test/exact', title: a.mint, publishedAt: null, publisher: 'publisher.test' }, 'rss').matchStatus).toBe('EXACT_REFERENCE');
    expect(news.list(b.mint)).toHaveLength(1);
  } finally { store.close(); }
});
it('restricts RSS to allowlisted feeds, rejects entities and handles missing publication times', async () => {
  const feed = 'https://publisher.test/rss';
  let calls = 0;
  const http = new HttpClient({ fetch: async () => { calls++; return new Response('<rss><channel><item><title>Market</title><link>https://publisher.test/a</link></item></channel></rss>'); } });
  expect(() => new RssAdapter([feed], http)).toThrow('allowlist');
  const adapter = new RssAdapter([feed], http, [feed]);
  expect((await adapter.collect())[0]!.publishedAt).toBeNull(); expect(calls).toBe(1);
  expect(() => adapter.parse('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>', feed)).toThrow();
  expect(() => adapter.parse('<invalid>', feed)).toThrow();
  expect(await new RssAdapter().collect()).toEqual([]);
});
