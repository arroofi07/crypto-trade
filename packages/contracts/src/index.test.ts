import { describe, expect, it } from 'vitest';
import { decimalStringSchema, timestampSchema, reasonCodeSchema } from './index.js';

describe('shared primitive contracts', () => {
  it('preserves decimal precision and rejects floating point/exponent input', () => {
    expect(decimalStringSchema.parse('0.00000000000000000001')).toBe('0.00000000000000000001');
    for (const value of [0.1, 'NaN', '1e-8', '01.2', 'Infinity', ' 1']) {
      expect(decimalStringSchema.safeParse(value).success).toBe(false);
    }
  });
  it('accepts UTC ISO timestamps only and stable reason codes', () => {
    expect(timestampSchema.safeParse('2026-10-22T01:02:03.000Z').success).toBe(true);
    for (const value of ['2026-10-22', '2026-10-22T08:02:03+07:00', '2026-02-30T00:00:00Z']) {
      expect(timestampSchema.safeParse(value).success).toBe(false);
    }
    expect(reasonCodeSchema.parse('DATA_GAP')).toBe('DATA_GAP');
    expect(reasonCodeSchema.safeParse('invented_reason').success).toBe(false);
  });
});
