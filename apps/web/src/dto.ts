import { z } from 'zod';
import { portfolioSchema, tokenSchema, poolSchema, snapshotSchema, securitySchema, positionSchema, decimal, configSchema, settingsSchema } from '@memecoin/contracts';

export const portfolioView = portfolioSchema.extend({ equityIdr: decimal.nullable(), availableCashIdr: decimal, reservedCashIdr: decimal, openRiskIdr: decimal, unpriced: z.boolean(), daily: z.object({ openingEquityIdr: decimal.nullable(), haltedAt: z.string().nullable(), resetPending: z.boolean() }) });
export type PortfolioView = z.infer<typeof portfolioView>;
export const tokenView = tokenSchema.extend({ pool: poolSchema.nullable(), snapshot: snapshotSchema.nullable(), stale: z.boolean(), limitations: z.array(z.string()), security: securitySchema.nullable().optional(), securityFresh: z.boolean().optional() });
export type TokenView = z.infer<typeof tokenView>;
export const positionView = positionSchema.extend({ snapshot: snapshotSchema.nullable(), stale: z.boolean(), simulation: z.boolean(), exitIntent: z.object({ requestedAt: z.string(), reason: z.string() }).passthrough().nullable() });
export type PositionView = z.infer<typeof positionView>;
export const previewSchema = z.object({ allowed: z.boolean(), reasonCodes: z.array(z.string()), quantityRaw: z.string(), quantity: decimal, entryCostIdr: decimal, plannedLossIdr: decimal, targetObservedUsd: decimal, targetRewardIdr: decimal, budgetIdr: decimal, equityBasisIdr: decimal.nullable(), expiresAt: z.string(), feeAssumptions: z.record(z.string(), z.string()), configVersionIds: z.record(z.string(), z.string()), observedAt: z.string() });
export type Preview = z.infer<typeof previewSchema>;
export const settingsView = settingsSchema.extend({ configs: z.array(configSchema), activeExperimentId: z.string().nullable() });
