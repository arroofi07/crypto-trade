import { z } from 'zod';
import { decimal, positive, utc } from './models.js';

export function validMint(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const char of value) number = number * 58n + BigInt(alphabet.indexOf(char));
  let bytes = 0;
  while (number > 0n) { bytes += 1; number >>= 8n; }
  return bytes + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
export const mintSchema = z.string().refine(validMint, 'Mint Solana harus berupa alamat 32 byte.');
export const watchInputSchema = z.object({ mint: mintSchema }).strict();
export const tokenSchema = z.object({ id: z.uuid(), mint: mintSchema, chain: z.literal('solana'), name: z.string().nullable(), symbol: z.string().nullable(), decimals: z.number().int().min(0).max(18).nullable(), watchlistEnabled: z.boolean(), canonicalPoolId: z.string().nullable(), poolSelectedAt: utc.nullable(), warmupSince: utc, candidateState: z.enum(['WATCH','BLOCKED','WARMING_UP','ELIGIBLE']), reasonCodes: z.array(z.string()) });
export type Token = z.infer<typeof tokenSchema>;
export const poolSchema = z.object({ id: z.uuid(), tokenId: z.uuid(), address: mintSchema, provider: z.literal('dexscreener'), dexId: z.enum(['raydium','orca','meteora','pumpswap']), quoteMint: mintSchema, createdAtSource: utc });
export type Pool = z.infer<typeof poolSchema>;
export const snapshotSchema = z.object({
  id: z.uuid(), tokenId: z.uuid(), poolId: z.uuid(), observedAt: utc, sourceAt: utc.nullable(), priceUsd: positive, liquidityUsd: positive,
  volume24hUsd: decimal.nullable(), rollingVolume5mUsd: decimal.nullable(),
  txnsM5Buys: z.number().int().nonnegative().nullable(), txnsM5Sells: z.number().int().nonnegative().nullable(),
  txnsH1Buys: z.number().int().nonnegative().nullable(), txnsH1Sells: z.number().int().nonnegative().nullable(),
  source: z.literal('dexscreener'), quality: z.literal('sampled'), sourceTimestampAvailable: z.boolean(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const txnSeriesSchema = z.object({
  points: z.array(z.object({ observedAt: utc, buysM5: z.number().int().nonnegative(), sellsM5: z.number().int().nonnegative(), buysH1: z.number().int().nonnegative().optional(), sellsH1: z.number().int().nonnegative().optional() })),
  latest: z.object({ observedAt: utc, buysM5: z.number().int().nonnegative(), sellsM5: z.number().int().nonnegative(), buysH1: z.number().int().nonnegative().nullable(), sellsH1: z.number().int().nonnegative().nullable(), leaderM5: z.enum(['BUY', 'SELL', 'TIE']), leaderH1: z.enum(['BUY', 'SELL', 'TIE']).nullable() }).nullable(),
  limitations: z.array(z.string()),
});
export type TxnSeries = z.infer<typeof txnSeriesSchema>;
export const barSchema = z.object({ id: z.uuid(), poolId: z.uuid(), openAt: utc, closeAt: utc, firstObservedAt: utc, lastObservedAt: utc, sampleCount: z.number().int().positive(), open: positive, high: positive, low: positive, close: positive, complete: z.boolean(), sampling: z.literal('sampled'), gap: z.boolean() });
export type Bar = z.infer<typeof barSchema>;
export interface JobState { id: string; lastStartedAt: string | null; lastSucceededAt: string | null; lastErrorCode: string | null; checkpoint: Record<string, unknown> }
export interface DataGap { id: string; scope: string; startedAt: string; endedAt: string | null; reason: string }
