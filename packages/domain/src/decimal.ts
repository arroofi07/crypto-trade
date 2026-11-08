import { Decimal } from 'decimal.js';
export const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_DOWN, toExpNeg: -100, toExpPos: 100 });
export type Dec = Decimal;
export const sum = (values: string[]) => values.reduce((total, value) => total.plus(value), new D(0));
