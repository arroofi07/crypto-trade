import { expect, it } from 'vitest';
import { calculateSizing, defaultCost, dayKey } from './risk.js';
import type { SizingInput } from './risk.js';
import { D } from './decimal.js';
const input: SizingInput = { observedUsd: '1', stopUsd: '0.98', fxUsdIdr: '16000', equityIdr: '500000', availableCashIdr: '500000', liquidityUsd: '1000000', decimals: 6, existingRiskIdr: '0', count: 0, duplicateMint: false, unpriced: false, halted: false };
it('matches the independent hand-calculated golden fixture after rounding raw quantity down', () => {
  const result = calculateSizing(input);
  expect(result.allowed).toBe(true); expect(result.budgetIdr).toBe('2500');
  expect(result.quantityRaw).toBe('2049601'); expect(result.quantity).toBe('2.049601');
  expect(result.entryCostIdr).toBe('33720.91681648'); expect(result.plannedLossIdr).toBe('2499.9996720096');
  expect(new D(result.targetObservedUsd).toDecimalPlaces(8).toFixed()).toBe('1.17309023');
  expect(new D(result.targetRewardIdr).minus('3749.9995080144').abs().lt('0.000000001')).toBe(true);
});
it('rejects expensive costs, exhausted total risk, zero quantity and targets above 30%', () => {
  expect(calculateSizing({ ...input, cost: { ...defaultCost, fixedFeeIdr: '1300' } }).reasonCodes).toContain('COST_TOO_HIGH');
  expect(calculateSizing({ ...input, availableCashIdr: '500' }).reasonCodes).toContain('INSUFFICIENT_CASH');
  expect(calculateSizing({ ...input, existingRiskIdr: '6500' }).reasonCodes).toContain('OPEN_RISK_LIMIT');
  expect(calculateSizing({ ...input, decimals: 0, availableCashIdr: '501' }).reasonCodes).toContain('QUANTITY_ZERO');
  expect(calculateSizing({ ...input, stopUsd: '0.9' }).reasonCodes).toContain('TARGET_TOO_FAR');
  expect(calculateSizing({ ...input, unpriced: true }).reasonCodes).toContain('UNPRICED_POSITION');
  expect(calculateSizing({ ...input, halted: true }).reasonCodes).toContain('DAILY_HALT');
  expect(calculateSizing({ ...input, count: 3 }).reasonCodes).toContain('OPEN_RISK_LIMIT');
});
it('rechecks rounded costs/risk across cash, liquidity and precision boundaries', () => {
  for (const cash of ['1000','10000','50000','500000']) for (const decimals of [0, 3, 6, 9]) {
    const result = calculateSizing({ ...input, availableCashIdr: cash, decimals });
    if (!result.allowed) continue;
    expect(new D(result.entryCostIdr).lte(cash)).toBe(true); expect(new D(result.entryCostIdr).lte('50000')).toBe(true);
    expect(new D(result.plannedLossIdr).lte('2500')).toBe(true); expect(new D(result.notionalUsd).lte('100')).toBe(true);
    expect(new D(result.quantityRaw).isInteger()).toBe(true);
  }
  expect(dayKey('2026-10-22T16:59:59.999Z')).toBe('2026-10-22'); expect(dayKey('2026-10-22T17:00:00.000Z')).toBe('2026-10-23');
});
