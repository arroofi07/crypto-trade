import { configSchema, experimentInputSchema, experimentSchema, portfolioSchema, settingsPatchSchema, settingsSchema } from '@memecoin/contracts';
import type { ConfigVersion, Experiment, LedgerEntry, Portfolio } from '@memecoin/contracts';
import { Store, hash } from '../db/store.ts';
import { strategyParameters, defaultCost, defaultRisk } from '@memecoin/domain';
import type { CostModel } from '@memecoin/domain';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'UNAVAILABLE' | 'RATE_LIMITED';
  constructor(statusCode: number, code: AppError['code'], message: string) { super(message); this.statusCode = statusCode; this.code = code; }
}
export const riskDefaults = { ...defaultRisk };
export const costDefaults = { ...defaultCost };
export const strategyDefaults = strategyParameters;
export class SettingsService {
  readonly store: Store;
  constructor(store: Store) {
    this.store = store;
    if (!store.get('settings', 'main')) store.put('settings', { id: 'main', pollingSeconds: 30, timezone: 'Asia/Bangkok' });
  }
  settings() { const value = this.store.get<{ pollingSeconds: number; timezone: 'Asia/Bangkok' }>('settings', 'main')!; return settingsSchema.parse({ pollingSeconds: value.pollingSeconds, timezone: value.timezone }); }
  update(input: unknown) {
    const patch = settingsPatchSchema.parse(input);
    return this.store.transaction(() => { const value = settingsSchema.parse({ ...this.settings(), ...patch }); this.store.put('settings', { id: 'main', ...value }); this.store.audit('settings.changed', 'main', patch); return value; });
  }
  config(kind: ConfigVersion['kind'], version: string, payload: ConfigVersion['payload']) {
    const digest = hash({ version, payload });
    const existing = this.store.list<ConfigVersion>('config_versions', 'kind=? AND hash=?', [kind, digest])[0];
    return existing ?? this.store.put('config_versions', configSchema.parse({ id: this.store.id(), kind, version, payload, hash: digest, createdAt: this.store.now() }), { kind, hash: digest }, true);
  }
  configs() { return this.store.list<ConfigVersion>('config_versions').map((c) => configSchema.parse(c)); }
  portfolios() { return this.store.list<Portfolio>('portfolios').map((p) => portfolioSchema.parse(p)); }
  activeExperiment() { return this.store.list<{ id: string }>('experiments', 'active=1')[0]?.id ?? null; }
  experiments(): Experiment[] { return this.store.list<{ id: string; active: boolean; createdAt: string }>('experiments').map((e) => experimentSchema.parse({ ...e, portfolios: this.portfolios().filter((p) => p.experimentId === e.id) })); }
  create(input: unknown, replayCost?: CostModel) {
    const request = experimentInputSchema.parse(input);
    return this.store.transaction(() => {
      if (request.activate) {
        const auto = this.portfolios().filter((p) => p.mode === 'strategy');
        if (auto.some((p) => this.store.list('positions', "portfolio_id=? AND state IN ('OPEN','UNPRICED')", [p.id]).length || this.store.list('entry_requests', "portfolio_id=? AND state='PENDING'", [p.id]).length)) throw new AppError(409, 'CONFLICT', 'Portfolio strategy lama masih memiliki posisi atau pending.');
        for (const old of this.store.list<{ id: string; active: boolean; createdAt: string }>('experiments', 'active=1')) this.store.put('experiments', { ...old, active: false }, { active: 0 });
      }
      const fx = this.config('fx', 'manual-fixed-v1', { usdIdr: request.fxUsdIdr, source: 'MANUAL_FIXED', observedAt: this.store.now() });
      const risk = this.config('risk', 'risk-v1', riskDefaults), cost = this.config('cost', replayCost ? 'replay-cost-v1' : 'cost-model-v1', { ...(replayCost ?? costDefaults) }), strategy = this.config('strategy', 'momentum-pullback-v1', strategyDefaults);
      const experiment = { id: this.store.id(), active: request.activate, createdAt: this.store.now() };
      this.store.put('experiments', experiment, { active: Number(experiment.active) }, true);
      const portfolios = (['strategy', 'manual'] as const).map((mode) => {
        const p = portfolioSchema.parse({ id: this.store.id(), experimentId: experiment.id, mode, initialCashIdr: '500000', cashIdr: '500000', fxConfigId: fx.id, riskConfigId: risk.id, costConfigId: cost.id, strategyConfigId: strategy.id, createdAt: this.store.now() });
        this.store.put('portfolios', p, { experiment_id: experiment.id, mode }, true);
        const deposit: LedgerEntry = { id: this.store.id(), portfolioId: p.id, positionId: null, fillId: null, amountIdrSigned: '500000', reason: 'INITIAL_DEPOSIT', createdAt: this.store.now() };
        this.store.put('cash_ledger', deposit, { portfolio_id: p.id, position_id: null, fill_id: null }, true);
        return p;
      });
      this.store.audit('experiment.created', experiment.id, { activate: request.activate, fxConfigId: fx.id });
      return experimentSchema.parse({ ...experiment, portfolios });
    });
  }
}
