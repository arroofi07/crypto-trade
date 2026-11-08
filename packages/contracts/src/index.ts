import { z } from 'zod';
export * from './models.js';
export * from './market.js';
export * from './security.js';
export * from './news.js';
export * from './trading.js';
export * from './performance.js';
export * from './discovery.js';

export const decimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/).brand<'DecimalString'>();
export type DecimalString = z.infer<typeof decimalStringSchema>;
export const timestampSchema = z.iso.datetime({ offset: false }).brand<'UtcTimestamp'>();
export type UtcTimestamp = z.infer<typeof timestampSchema>;

export const reasonCodeSchema = z.enum([
  'STALE_MARKET', 'SECURITY_FAIL', 'SECURITY_UNKNOWN', 'WARMUP_REQUIRED',
  'SIGNAL_EXPIRED', 'OUTSIDE_ENTRY_RANGE', 'DAILY_HALT', 'OPEN_RISK_LIMIT',
  'INSUFFICIENT_CASH', 'COST_TOO_HIGH', 'DUPLICATE_ENTRY', 'UNPRICED_POSITION', 'DATA_GAP',
]);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const responseMetaSchema = z.object({ requestId: z.uuid(), observedAt: timestampSchema, nextCursor: z.string().nullable().optional(), limit: z.number().optional() });
export function successEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}
export type SuccessEnvelope<T> = { data: T; meta: z.infer<typeof responseMetaSchema> };
export const apiErrorCodeSchema = z.enum([
  'UNAUTHORIZED', 'FORBIDDEN_HOST', 'FORBIDDEN_ORIGIN', 'INVALID_REQUEST',
  'JSON_REQUIRED', 'NOT_FOUND', 'INTERNAL_ERROR', 'CONFLICT', 'UNAVAILABLE', 'RATE_LIMITED',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export const errorEnvelopeSchema = z.object({
  error: z.object({ code: apiErrorCodeSchema, message: z.string(), details: z.unknown().optional() }),
  requestId: z.uuid(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const healthSchema = z.object({
  application: z.literal('ready'),
  mode: z.enum(['setup', 'simulation']),
  database: z.enum(['not_configured', 'ready']),
  providers: z.enum(['not_implemented','unavailable','stale','ready','idle']),
  scheduler: z.enum(['not_implemented','running','stopped']),
  lastJobAt: timestampSchema.nullable(),
  dataGap: z.enum(['unknown','present','none']),
  telegram: z.enum(['disabled','running','stopped','unavailable','delivery_unknown']),
  jobs: z.array(z.object({ id: z.string(), lastStartedAt: timestampSchema.nullable(), lastSucceededAt: timestampSchema.nullable(), lastErrorCode: z.string().nullable(), checkpoint: z.record(z.string(), z.unknown()) })).optional(),
  limitations: z.array(z.string()).optional(),
});
export const healthResponseSchema = successEnvelopeSchema(healthSchema);
export type Health = z.infer<typeof healthSchema>;
