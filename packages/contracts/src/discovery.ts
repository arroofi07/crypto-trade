import { z } from 'zod';
import { mintSchema } from './market.js';
import { utc } from './models.js';

export const discoveryCandidateSchema = z.object({
  id: z.uuid(),
  mint: mintSchema,
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  poolAddress: mintSchema,
  dexId: z.enum(['raydium', 'orca', 'meteora', 'pumpswap']),
  priceUsd: z.string(),
  liquidityUsd: z.string(),
  volume24hUsd: z.string().nullable(),
  score: z.number(),
  reasonCodes: z.array(z.string()),
  firstSeenAt: utc,
  lastSeenAt: utc,
  expiresAt: utc,
  dismissed: z.boolean(),
  promoted: z.boolean(),
  source: z.enum(['boost', 'boost_top', 'profile', 'profile_update', 'takeover', 'ads', 'search', 'meta']),
  securityStatus: z.enum(['PASS', 'FAIL', 'UNKNOWN', 'PENDING']).default('PENDING'),
  securityTradable: z.boolean().default(false),
  securityCodes: z.array(z.string()).default([]),
  securityCheckedAt: utc.nullable().default(null),
});
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;

export const discoveryDismissSchema = z.object({}).strict();
