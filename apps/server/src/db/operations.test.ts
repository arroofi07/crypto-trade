import { expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { EntryRequest, Fill, OutboxEvent, PortfolioDay } from '@memecoin/contracts';
import { Store } from './store.ts';
import { backup, restore, retainSnapshots, verifyBackup } from './operations.ts';
import { createTradingFixture } from '../../../../tests/fixtures/trading.ts';
import { Services } from '../modules/services.ts';
import { recover } from '../modules/recovery.ts';
import { RotatingLogs } from '../log-files.ts';

it('holds one writer, backs up a live connection, retains seven and restores ledger/config consistently', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'memecoin operations ')), path = join(directory, 'database.sqlite'), f = createTradingFixture(path);
  try {
    const signal = await f.warmup(), portfolio = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
    f.services.paper.request(signal.id, portfolio.id, 'backup'); await f.observe('1.066');
    expect(() => new Store(path)).toThrow('writer lain');
    const ledger = f.store.list('cash_ledger'), configs = f.store.list('config_versions'), positions = f.store.list('positions');
    const backups = join(directory, 'backups'); let file = '';
    for (let i = 0; i < 8; i++) { f.clock.advance(1000); file = await backup(f.store, backups); }
    expect(readdirSync(backups).filter((name) => name.endsWith('.sqlite'))).toHaveLength(7); verifyBackup(file);
    await expect(restore(file, path)).rejects.toThrow('writer lain');
    await f.services.close();
    const result = await restore(file, path); expect(result.preRestore).not.toBeNull();
    const restored = new Store(path); try { expect(restored.list('cash_ledger')).toEqual(ledger); expect(restored.list('config_versions')).toEqual(configs); expect(restored.list('positions')).toEqual(positions); } finally { restored.close(); }
    const invalid = join(directory, 'invalid.sqlite'); writeFileSync(invalid, 'not sqlite'); await expect(restore(invalid, path)).rejects.toThrow();
  } finally { await f.services.close(); rmSync(directory, { recursive: true, force: true }); }
}, 20_000);
it('restart expires reservations, preserves daily halt, marks positions unpriced, and never backfills', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'memecoin recovery ')), path = join(directory, 'db.sqlite'), f = createTradingFixture(path);
  let restarted: Services | undefined;
  try {
    const signal = await f.warmup(), experiment = f.services.settings.create({ fxUsdIdr: '16000', activate: true }), manual = experiment.portfolios[1]!, auto = experiment.portfolios[0]!;
    f.services.paper.request(signal.id, manual.id, 'open'); await f.observe('1.066');
    const pending = f.services.paper.request(signal.id, auto.id, 'pending', 'auto'); expect(pending.state).toBe('PENDING');
    const day = f.services.risk.daily(manual.id, '480000'); expect(day.haltedAt).not.toBeNull();
    const row = f.store.list<OutboxEvent>('outbox').find((r) => r.channel === 'telegram')!; f.store.put('outbox', { ...row, state: 'SENDING' }, { state: 'SENDING', dedupe_key: row.dedupeKey, next_attempt_at: row.nextAttemptAt });
    const ledger = f.store.list('cash_ledger'); await f.services.close(); f.clock.advance(3 * 3600_000);
    const store = new Store(path, f.clock); restarted = new Services(store, { market: { tokens: async () => [], pairs: async () => [], discover: async () => ({ pairs: [], cursor: { metaOffset: 0, searchOffset: 0 } }) }, security: { inspect: async () => { throw new Error('offline'); } } });
    recover(restarted); expect(store.list('cash_ledger')).toEqual(ledger); expect(store.get<EntryRequest>('entry_requests', pending.id)).toMatchObject({ state: 'EXPIRED', reservedCashIdr: '0', reservedRiskIdr: '0' });
    expect(restarted.paper.list()[0]!.state).toBe('UNPRICED'); expect(restarted.risk.valuation(manual.id).equityIdr).toBeNull(); expect(store.get<PortfolioDay>('portfolio_days', day.id)!.haltedAt).toBe(day.haltedAt);
    expect(store.list('outbox', "state='DELIVERY_UNKNOWN'")).toHaveLength(1); expect(store.list('data_gaps').length).toBeGreaterThan(0);
    expect(store.list<Fill>('fills')).toHaveLength(1);
    // First real observation after offline gap, not a synthetic fill at the due timestamp.
    const position = restarted.paper.list()[0]!, old = restarted.market.latest(position.poolId)!;
    const fresh = { ...old, id: store.id(), priceUsd: '1.07', observedAt: store.now() };
    store.put('market_snapshots', fresh, { pool_id: fresh.poolId, observed_at: fresh.observedAt }, true); restarted.paper.consume(fresh);
    expect(restarted.paper.position(position.id)).toMatchObject({ state: 'CLOSED', exitReason: 'TIME', qualityFlags: expect.arrayContaining(['DATA_GAP']) });
    expect(store.list<Fill>('fills').at(-1)!.observedAt).toBe(store.now());
    const count = store.list('cash_ledger').length; recover(restarted); expect(store.list('cash_ledger')).toHaveLength(count);
  } finally { await restarted?.close(); await f.services.close(); rmSync(directory, { recursive: true, force: true }); }
});
it('retention preserves decision/signal/fill evidence and log rotation keeps fourteen UTC days', async () => {
  const f = createTradingFixture(), directory = mkdtempSync(join(tmpdir(), 'memecoin logs '));
  try {
    const signal = await f.warmup(), portfolio = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
    f.services.paper.request(signal.id, portfolio.id, 'retain'); await f.observe('1.066');
    const referenced = (signal.evidence.snapshot as { id: string }).id, fill = f.store.list<Fill>('fills')[0]!;
    f.clock.advance(31 * 86400_000); expect(retainSnapshots(f.store)).toBeGreaterThan(0);
    expect(f.store.get('market_snapshots', referenced)).toBeDefined(); expect(f.store.get('market_snapshots', fill.sourceSnapshotId)).toBeDefined();
    const old = 'app-2026-01-01-0.log'; writeFileSync(join(directory, old), 'old'); writeFileSync(join(directory, 'keep.txt'), 'keep');
    const logs = new RotatingLogs(directory, () => new Date('2026-01-15T00:00:00Z'), 10); logs.write('1234567890'); logs.write('second');
    expect(readdirSync(directory)).not.toContain(old); expect(readdirSync(directory)).toEqual(expect.arrayContaining(['keep.txt','app-2026-01-15-0.log','app-2026-01-15-1.log']));
  } finally { await f.services.close(); rmSync(directory, { recursive: true, force: true }); }
});
