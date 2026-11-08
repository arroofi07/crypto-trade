import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { httpUrlSchema } from '@memecoin/contracts';
import { HttpClient, ProviderError } from './http.ts';

// No publisher currently has both verified access and suitable terms for this application.
export const approvedFeeds: readonly string[] = [];
// eslint-disable-next-line no-control-regex -- Intentionally remove control bytes from untrusted feed text.
export function plainText(value: string, max = 300) { return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/&(?:lt|gt|quot|apos|amp);/g, (entity) => ({ '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' })[entity]!).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }
export function canonicalUrl(value: string) {
  const url = new URL(httpUrlSchema.parse(value)); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort(); return url.toString();
}
export interface RssArticle { url: string; title: string; publishedAt: string | null; publisher: string }
export class RssAdapter {
  readonly feeds: readonly string[]; private readonly http: HttpClient;
  constructor(feeds: readonly string[] = [], http = new HttpClient({ budget: 6 }), allowlist = approvedFeeds) {
    if (feeds.length > 3 || new Set(feeds).size !== feeds.length || feeds.some((url) => !allowlist.includes(url))) throw new Error('RSS di luar allowlist.');
    this.feeds = feeds; this.http = http;
  }
  parse(xml: string, feed: string): RssArticle[] {
    if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new ProviderError('INVALID_FEED');
    const tree: unknown = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false }).parse(xml);
    const root = z.object({ rss: z.object({ channel: z.object({ item: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional() }) }) }).safeParse(tree);
    if (!root.success) throw new ProviderError('INVALID_FEED');
    const raw = root.data.rss.channel.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];
    return items.slice(0, 100).flatMap((value) => {
      const parsed = z.object({ title: z.string(), link: httpUrlSchema, pubDate: z.string().optional() }).safeParse(value);
      if (!parsed.success) return [];
      const timestamp = parsed.data.pubDate ? Date.parse(parsed.data.pubDate) : NaN;
      return [{ url: canonicalUrl(parsed.data.link), title: plainText(parsed.data.title), publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null, publisher: new URL(feed).hostname }];
    });
  }
  async collect() { const articles: RssArticle[] = []; for (const feed of this.feeds) articles.push(...this.parse(await this.http.text(feed), feed)); return articles; }
}
