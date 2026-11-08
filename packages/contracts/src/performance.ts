import { z } from 'zod';
import { configSchema, decimal, portfolioSchema, utc } from './models.js';
import { positionSchema, signalSchema } from './trading.js';
export const performanceQuerySchema = z.object({ portfolioId: z.uuid(), from: utc.optional(), to: utc.optional(), strategyConfigId: z.uuid().optional() }).refine((v) => !v.from || !v.to || v.from <= v.to, 'Periode tidak valid.');
export const fillSchema = z.object({ id: z.uuid(), positionId: z.uuid(), side: z.enum(['BUY','SELL']), quantityRaw: z.string(), observedPrice: decimal, effectivePrice: decimal, feesIdr: decimal, observedAt: utc, filledAt: utc, sourceSnapshotId: z.uuid(), qualityFlags: z.array(z.string()), costConfigId: z.uuid() });
export const ledgerSchema = z.object({ id: z.uuid(), portfolioId: z.uuid(), positionId: z.uuid().nullable(), fillId: z.uuid().nullable(), amountIdrSigned: decimal, reason: z.string(), createdAt: utc });
export const equitySchema = z.object({ id: z.uuid(), portfolioId: z.uuid(), observedAt: utc, cashIdr: decimal, equityIdr: decimal.nullable(), qualityFlags: z.array(z.string()) });
export const performanceSchema = z.object({
  portfolio: portfolioSchema, configs: z.array(configSchema), period: z.object({ from: utc, to: utc }),
  metrics: z.object({ closedCount: z.number(), wins: z.number(), losses: z.number(), breakeven: z.number(), winRate: decimal.nullable(), netPnlIdr: decimal, averageWinIdr: decimal.nullable(), averageLossIdr: decimal.nullable(), expectancyIdr: decimal.nullable(), profitFactor: z.string(), averageHoldSeconds: z.number().nullable(), feesIdr: decimal, slippageIdr: decimal, observedDrawdown: decimal.nullable(), drawdownUnknownDuringGap: z.boolean(), currentExposureIdr: decimal.nullable() }),
  coverage: z.object({ signals: z.number(), decisions: z.number(), skipped: z.number(), skipReasons: z.record(z.string(), z.number()), pending: z.number(), open: z.number(), unpriced: z.number(), gaps: z.number(), validEquitySamples: z.number(), missingEquitySamples: z.number(), eligibleTrades: z.number() }),
  equity: z.array(equitySchema), trades: z.array(z.object({ position: positionSchema, signal: signalSchema, fills: z.array(fillSchema), ledger: z.array(ledgerSchema), netPnlIdr: decimal.nullable() })), limitations: z.array(z.string()),
});
export type Performance = z.infer<typeof performanceSchema>;
