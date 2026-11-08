import { z } from 'zod';
import { utc, decimal } from './models.js';
export const securitySchema = z.object({
  id: z.uuid(), tokenId: z.uuid(), checkedAt: utc, expiresAt: utc, status: z.enum(['PASS','FAIL','UNKNOWN']),
  checks: z.array(z.object({ code: z.string(), status: z.enum(['PASS','FAIL','UNKNOWN']), text: z.string() })),
  evidence: z.record(z.string(), z.unknown()), decoderVersion: z.string(),
  largestRatio: decimal.nullable(), top10Ratio: decimal.nullable(), limitations: z.array(z.string()),
});
export type SecurityCheck = z.infer<typeof securitySchema>;
