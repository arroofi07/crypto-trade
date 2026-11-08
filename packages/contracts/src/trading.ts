import { z } from 'zod';
import { decimal, positive, utc } from './models.js';
import { mintSchema } from './market.js';
import { securitySchema } from './security.js';
export const signalSchema = z.object({
  id: z.uuid(), tokenId: z.uuid(), poolId: z.uuid(), state: z.enum(['VALID','EXPIRED','INVALIDATED']),
  token: z.object({ chain: z.literal('solana'), mint: mintSchema, symbol: z.string().nullable(), name: z.string().nullable() }),
  publishedAt: utc, expiresAt: utc, entry: z.object({ lowUsd: positive, highUsd: positive, stopUsd: positive }),
  exitPlan: z.object({ maxHoldMinutes: z.number().int(), targetNetR: positive, invalidationReasons: z.array(z.string()) }),
  scenarios: z.object({ bullish: z.string(), neutral: z.string(), bearish: z.string() }),
  reasons: z.array(z.object({ code: z.string(), text: z.string(), evidenceIds: z.array(z.string()) })),
  security: securitySchema, dataQuality: z.object({ observedAt: utc, stale: z.boolean(), gaps: z.boolean(), sampling: z.literal('sampled') }),
  newsIds: z.array(z.uuid()), strategyVersion: z.string(), strategyConfigId: z.uuid(), configHash: z.string(), evidence: z.record(z.string(), z.unknown()),
});
export type Signal = z.infer<typeof signalSchema>;
export interface Decision { id: string; portfolioId: string | null; tokenId: string; signalId: string | null; evaluatedAt: string; outcome: string; reasonCodes: string[]; evidence: Record<string, unknown> }
export interface DomainEvent { id: string; type: string; occurredAt: string; entityId: string; portfolioId?: string; data: Record<string, unknown> }
export const configRefsSchema = z.object({ fx: z.uuid(), risk: z.uuid(), cost: z.uuid(), strategy: z.uuid() });
export const positionSchema = z.object({ id: z.uuid(), portfolioId: z.uuid(), signalId: z.uuid(), poolId: z.uuid(), mint: mintSchema, state: z.enum(['OPEN','UNPRICED','CLOSED']), quantityRaw: z.string().regex(/^\d+$/), decimals: z.number().int(), entryObservedPrice: positive, entryEffectivePrice: positive, entryCostIdr: positive, entryFeesIdr: decimal, stopPrice: positive, targetPrice: positive, openedAt: utc, dueAt: utc, closedAt: utc.nullable(), plannedRiskIdr: positive, configRefs: configRefsSchema, exitFeesIdr: decimal.nullable(), pnlIdr: decimal.nullable(), exitReason: z.string().nullable(), qualityFlags: z.array(z.string()) });
export type Position = z.infer<typeof positionSchema>;
export const entryRequestSchema = z.object({ id: z.uuid(), portfolioId: z.uuid(), signalId: z.uuid(), mint: mintSchema, requestedAt: utc, expiresAt: utc, state: z.enum(['PENDING','FILLED','REJECTED','EXPIRED','CANCELLED']), reservedCashIdr: decimal, reservedRiskIdr: decimal, idempotencyKey: z.string(), reasonCodes: z.array(z.string()), positionId: z.uuid().nullable() });
export type EntryRequest = z.infer<typeof entryRequestSchema>;
export interface Fill { id: string; positionId: string; side: 'BUY' | 'SELL'; quantityRaw: string; observedPrice: string; effectivePrice: string; feesIdr: string; observedAt: string; filledAt: string; sourceSnapshotId: string; qualityFlags: string[]; costConfigId: string }
export interface ExitIntent { id: string; positionId: string; requestedAt: string; reason: 'MANUAL' | 'SECURITY'; confirmed: boolean }
export interface EquitySnapshot { id: string; portfolioId: string; observedAt: string; cashIdr: string; equityIdr: string | null; qualityFlags: string[] }
