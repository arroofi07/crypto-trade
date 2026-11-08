import { z } from 'zod';
import { utc } from './models.js';
import { mintSchema } from './market.js';
export const httpUrlSchema = z.string().max(2048).url().refine((value) => { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password; });
export const newsInputSchema = z.object({ url: httpUrlSchema, title: z.string().min(1).max(300), mint: mintSchema.optional() }).strict();
export const newsSchema = z.object({ id: z.uuid(), canonicalUrl: httpUrlSchema, title: z.string().max(300), publisher: z.string(), excerpt: z.string().max(240), publishedAt: utc.nullable(), firstSeenAt: utc, matchStatus: z.enum(['EXACT_REFERENCE','UNVERIFIED_MATCH','MARKET_CONTEXT']), source: z.enum(['manual','rss']), summary: z.string() });
export type NewsItem = z.infer<typeof newsSchema>;
export interface NewsLink { id: string; newsId: string; tokenId: string; matchMethod: 'MINT' | 'SYMBOL' | 'MANUAL'; confidenceLabel: 'EXACT_REFERENCE' | 'UNVERIFIED_MATCH'; firstSeenAt: string }
