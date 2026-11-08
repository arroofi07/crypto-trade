import { D } from './decimal.js';
export interface CostModel { slippage: string; feeRate: string; fixedFeeIdr: string; targetR: string; minimumR: string; maxTargetIncrease: string }
export interface RiskModel { perPosition: string; totalRisk: string; dailyLoss: string; maxPositions: number; maxAllocation: string; liquidityCap: string; timezone: string }
export const defaultCost: CostModel = { slippage: '0.01', feeRate: '0.003', fixedFeeIdr: '500', targetR: '1.5', minimumR: '1.2', maxTargetIncrease: '0.30' };
export const defaultRisk: RiskModel = { perPosition: '0.005', totalRisk: '0.015', dailyLoss: '0.02', maxPositions: 3, maxAllocation: '0.10', liquidityCap: '0.0001', timezone: 'Asia/Bangkok' };
export function buyCost(quantity: string, observed: string, fx: string, cost: CostModel = defaultCost) {
  const effective = new D(observed).mul(new D(1).plus(cost.slippage));
  const notional = new D(quantity).mul(effective).mul(fx), fees = notional.mul(cost.feeRate).plus(cost.fixedFeeIdr);
  return { effective: effective.toFixed(), fees: fees.toFixed(), total: notional.plus(fees).toFixed() };
}
export function sellProceeds(quantity: string, observed: string, fx: string, cost: CostModel = defaultCost) {
  const effective = new D(observed).mul(new D(1).minus(cost.slippage));
  const notional = new D(quantity).mul(effective).mul(fx), fees = notional.mul(cost.feeRate).plus(cost.fixedFeeIdr);
  return { effective: effective.toFixed(), fees: fees.toFixed(), total: notional.minus(fees).toFixed() };
}
export interface SizingInput { observedUsd: string; stopUsd: string; fxUsdIdr: string; equityIdr: string; availableCashIdr: string; liquidityUsd: string; decimals: number; existingRiskIdr: string; count: number; duplicateMint: boolean; unpriced: boolean; halted: boolean; cost?: CostModel; risk?: RiskModel }
export interface SizingResult { allowed: boolean; reasonCodes: string[]; quantityRaw: string; quantity: string; notionalUsd: string; entryCostIdr: string; plannedLossIdr: string; targetObservedUsd: string; targetRewardIdr: string; entryFeesIdr: string; stopProceedsIdr: string; budgetIdr: string; netR: string }
export function calculateSizing(input: SizingInput): SizingResult {
  const cost = input.cost ?? defaultCost, risk = input.risk ?? defaultRisk;
  const result: SizingResult = { allowed: false, reasonCodes: [], quantityRaw: '0', quantity: '0', notionalUsd: '0', entryCostIdr: '0', plannedLossIdr: '0', targetObservedUsd: '0', targetRewardIdr: '0', entryFeesIdr: '0', stopProceedsIdr: '0', budgetIdr: '0', netR: '0' };
  const reject = (code: string) => ({ ...result, reasonCodes: [code] });
  if (input.unpriced) return reject('UNPRICED_POSITION'); if (input.halted) return reject('DAILY_HALT'); if (input.duplicateMint) return reject('DUPLICATE_ENTRY');
  if (input.count >= risk.maxPositions) return reject('OPEN_RISK_LIMIT');
  const k = new D(input.fxUsdIdr), e = new D(input.equityIdr), price = new D(input.observedUsd), stop = new D(input.stopUsd);
  if ([k,e,price,stop,new D(input.liquidityUsd)].some((v) => !v.isFinite() || !v.gt(0)) || !Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 18) return reject('INVALID_SIZING_INPUT');
  const fixed = new D(cost.fixedFeeIdr), budget = e.mul(risk.perPosition); result.budgetIdr = budget.toFixed();
  const p = price.mul(new D(1).plus(cost.slippage)), stopEffective = stop.mul(new D(1).minus(cost.slippage));
  const perEntry = k.mul(p).mul(new D(1).plus(cost.feeRate));
  const denominator = k.mul(p.mul(new D(1).plus(cost.feeRate)).minus(stopEffective.mul(new D(1).minus(cost.feeRate))));
  if (!denominator.gt(0) || budget.lte(fixed.mul(2))) return reject('COST_TOO_HIGH');
  const remainingRisk = e.mul(risk.totalRisk).minus(input.existingRiskIdr);
  if (remainingRisk.lte(fixed.mul(2))) return reject('OPEN_RISK_LIMIT');
  const availableCash = new D(input.availableCashIdr);
  if (availableCash.lte(fixed)) return reject('INSUFFICIENT_CASH');
  const caps = [budget.minus(fixed.mul(2)).div(denominator), remainingRisk.minus(fixed.mul(2)).div(denominator), availableCash.minus(fixed).div(perEntry), e.mul(risk.maxAllocation).minus(fixed).div(perEntry), new D(input.liquidityUsd).mul(risk.liquidityCap).div(p)];
  const factor = new D(10).pow(input.decimals), raw = D.min(...caps).mul(factor).floor();
  if (!raw.gt(0)) return reject('QUANTITY_ZERO');
  const quantity = raw.div(factor), entry = buyCost(quantity.toFixed(), price.toFixed(), k.toFixed(), cost), exit = sellProceeds(quantity.toFixed(), stop.toFixed(), k.toFixed(), cost);
  const loss = new D(entry.total).minus(exit.total);
  const target = new D(entry.total).plus(loss.mul(cost.targetR)).plus(fixed).div(quantity.mul(k).mul(new D(1).minus(cost.slippage)).mul(new D(1).minus(cost.feeRate)));
  const targetExit = sellProceeds(quantity.toFixed(), target.toFixed(), k.toFixed(), cost), reward = new D(targetExit.total).minus(entry.total), netR = reward.div(loss);
  if (target.gt(price.mul(new D(1).plus(cost.maxTargetIncrease)))) return reject('TARGET_TOO_FAR');
  if (!reward.gt(0) || netR.lt(cost.minimumR)) return reject('REWARD_TOO_LOW');
  if (new D(entry.total).gt(availableCash) || new D(entry.total).gt(e.mul(risk.maxAllocation)) || quantity.mul(p).gt(new D(input.liquidityUsd).mul(risk.liquidityCap)) || loss.gt(budget) || loss.gt(remainingRisk)) return reject('ROUNDING_LIMIT');
  return { allowed: true, reasonCodes: [], quantityRaw: raw.toFixed(0), quantity: quantity.toFixed(), notionalUsd: quantity.mul(p).toFixed(), entryCostIdr: entry.total, plannedLossIdr: loss.toFixed(), targetObservedUsd: target.toFixed(), targetRewardIdr: reward.toFixed(), entryFeesIdr: entry.fees, stopProceedsIdr: exit.total, budgetIdr: budget.toFixed(), netR: netR.toFixed() };
}
export function dayKey(now: string) { return new Date(Date.parse(now) + 7 * 3600_000).toISOString().slice(0, 10); }
