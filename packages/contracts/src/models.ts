import { z } from 'zod';

export const decimal = z.string().max(120).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const positive = decimal.refine((v) => !v.startsWith('-') && /[1-9]/.test(v), 'Harus positif.');
export const utc = z.iso.datetime();
export const settingsSchema = z.object({ pollingSeconds: z.number().int().min(30).max(300), timezone: z.literal('Asia/Bangkok') }).strict();
export const settingsPatchSchema = settingsSchema.partial().strict();
export const experimentInputSchema = z.object({ fxUsdIdr: positive, activate: z.boolean().default(false) }).strict();
export const configSchema = z.object({ id: z.uuid(), kind: z.enum(['strategy', 'risk', 'cost', 'fx']), version: z.string(), payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), hash: z.string(), createdAt: utc });
export type ConfigVersion = z.infer<typeof configSchema>;
export const portfolioSchema = z.object({ id: z.uuid(), experimentId: z.uuid(), mode: z.enum(['strategy', 'manual']), initialCashIdr: decimal, cashIdr: decimal, fxConfigId: z.uuid(), riskConfigId: z.uuid(), costConfigId: z.uuid(), strategyConfigId: z.uuid(), createdAt: utc });
export type Portfolio = z.infer<typeof portfolioSchema>;
export const experimentSchema = z.object({ id: z.uuid(), active: z.boolean(), createdAt: utc, portfolios: z.array(portfolioSchema) });
export type Experiment = z.infer<typeof experimentSchema>;
export interface LedgerEntry { id: string; portfolioId: string; positionId: string | null; fillId: string | null; amountIdrSigned: string; reason: string; createdAt: string }
export interface PortfolioDay { id: string; portfolioId: string; dayKey: string; openingEquityIdr: string | null; haltedAt: string | null; resetPending: boolean }
export interface OutboxEvent { id: string; eventId: string; channel: 'domain' | 'telegram'; dedupeKey: string; payload: Record<string, unknown>; state: 'PENDING' | 'SENDING' | 'DELIVERED' | 'RETRY' | 'DEAD' | 'DELIVERY_UNKNOWN'; attemptCount: number; nextAttemptAt: string; deliveredAt: string | null; externalMessageId: string | null }
