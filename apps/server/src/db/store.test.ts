import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.ts';
import { SettingsService } from '../modules/settings.ts';
import type { ConfigVersion, LedgerEntry } from '@memecoin/contracts';
import { createApp } from '../app.ts';
import { Services } from '../modules/services.ts';
import { createLogger } from '../logger.ts';

const stores: Store[] = [];
const paths: string[] = [];
afterEach(() => { stores.splice(0).forEach((s) => s.close()); paths.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })); });
function fixture(path?: string) { const store = new Store(path); stores.push(store); return { store, settings: new SettingsService(store) }; }
it('migrates once, persists precision, immutable configs and two independent deposits across restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memecoin-db-')); paths.push(dir);
  const { store, settings } = fixture(join(dir, 'db.sqlite'));
  const fx = '16000.12345678901234567890123456789';
  const experiment = settings.create({ fxUsdIdr: fx, activate: true });
  expect(experiment.portfolios.map((p) => p.cashIdr)).toEqual(['500000','500000']);
  expect(store.list<LedgerEntry>('cash_ledger')).toHaveLength(2);
  const version = settings.configs().find((c) => c.kind === 'fx')!;
  expect(version.payload.usdIdr).toBe(fx);
  expect(() => store.put('config_versions', { ...version, payload: {} }, { kind: 'fx', hash: version.hash })).toThrow('append-only');
  expect(store.db.pragma('journal_mode', { simple: true })).toBe('wal');
  store.close();
  const next = fixture(join(dir, 'db.sqlite'));
  expect(next.settings.portfolios()).toEqual(experiment.portfolios);
  expect(next.store.list<ConfigVersion>('config_versions')).toHaveLength(4);
  expect(next.store.list('cash_ledger')).toHaveLength(2);
  expect(next.store.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 2 });
});
it('rejects invalid FX, secret settings, partial transactions, foreign keys and duplicate deposits', () => {
  const { store, settings } = fixture();
  for (const fxUsdIdr of ['0', '-1', 'NaN', '1e9', 16000]) expect(() => settings.create({ fxUsdIdr })).toThrow();
  expect(() => settings.update({ telegramToken: 'secret' })).toThrow();
  expect(() => store.transaction(() => { settings.create({ fxUsdIdr: '16000' }); throw new Error('rollback'); })).toThrow('rollback');
  expect(settings.portfolios()).toEqual([]);
  expect(() => store.put('portfolios', { id: store.id() }, { experiment_id: store.id(), mode: 'manual' })).toThrow();
  settings.create({ fxUsdIdr: '16000' });
  const ledger = store.list<LedgerEntry>('cash_ledger')[0]!;
  expect(() => store.put('cash_ledger', ledger, { portfolio_id: ledger.portfolioId }, true)).toThrow();
  settings.update({ pollingSeconds: 60 });
  expect(settings.settings().pollingSeconds).toBe(60);
  expect(store.list('audit_events')).toHaveLength(2);
});

it('blocks experiment activation with pending auto entries and rolls back config changes', () => {
  const { store, settings } = fixture();
  const first = settings.create({ fxUsdIdr: '16000', activate: true });
  const token = store.id(), pool = store.id(), signal = store.id();
  store.put('tokens', { id: token }, { mint: 'fixture' });
  store.put('pools', { id: pool }, { token_id: token, address: 'fixture' });
  store.put('signals', { id: signal }, { token_id: token, pool_id: pool, state: 'VALID', expires_at: store.now() });
  const pending = { id: store.id() };
  const fields = { portfolio_id: first.portfolios[0]!.id, signal_id: signal, mint: 'fixture', state: 'PENDING' };
  store.put('entry_requests', pending, fields);
  expect(() => store.put('entry_requests', { id: store.id() }, fields)).toThrow();
  expect(() => settings.create({ fxUsdIdr: '17000', activate: true })).toThrow('masih memiliki');
  expect(settings.activeExperiment()).toBe(first.id);
  expect(settings.configs()).toHaveLength(4);
});

it('serves schema-validated portfolio/settings APIs without exposing environment secrets', async () => {
  const { store } = fixture();
  const app = await createApp({ token: 'fixture', port: 4317, serveUi: false, services: new Services(store), logger: createLogger('silent') });
  const headers = { host: '127.0.0.1:4317', authorization: 'Bearer fixture' };
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/experiments', headers, payload: { fxUsdIdr: '16000.123456789', activate: true } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.portfolios).toHaveLength(2);
    expect((await app.inject({ url: '/api/v1/health', headers })).json().data.database).toBe('ready');
    expect((await app.inject({ method: 'PATCH', url: '/api/v1/settings', headers, payload: { token: 'secret' } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/v1/settings', headers })).body).not.toContain('secret');
    const page = (await app.inject({ url: '/api/v1/portfolios?limit=1', headers })).json();
    expect(page.data).toHaveLength(1); expect(page.meta.nextCursor).toBe(page.data[0].id);
    const next = (await app.inject({ url: `/api/v1/portfolios?limit=1&cursor=${page.meta.nextCursor}`, headers })).json();
    expect(next.data).toHaveLength(1); expect(next.data[0].id).not.toBe(page.data[0].id); expect(next.meta.nextCursor).toBeNull();
    expect((await app.inject({ url: '/api/v1/portfolios?limit=101', headers })).statusCode).toBe(400);
  } finally { await app.close(); }
});
