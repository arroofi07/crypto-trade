import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { systemClock } from '@memecoin/domain';
import type { Clock } from '@memecoin/domain';
import { sql001 } from './migrations/001.ts';
import { sql002 } from './migrations/002.ts';

const IMMUTABLE_TABLES = ['config_versions', 'fills', 'cash_ledger', 'signal_events', 'audit_events', 'security_checks'] as const;
const MIGRATIONS = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
] as const;

export function canonical(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
const tables = new Set(['config_versions','settings','experiments','portfolios','tokens','pools','market_snapshots','sample_bars','security_checks','news_items','news_token_links','signals','signal_events','portfolio_days','entry_requests','positions','fills','cash_ledger','equity_snapshots','decisions','outbox','job_state','data_gaps','audit_events','idempotency','exit_intents','telegram_callbacks','discovery_candidates']);
export class Store {
  readonly db: Database.Database;
  readonly clock: Clock;
  readonly path: string;
  constructor(path = ':memory:', clock: Clock = systemClock) {
    this.clock = clock; this.path = path;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { timeout: 1000 });
    try {
      // SQLite owns the OS lock for this connection's lifetime, including between transactions.
      // A process crash releases it automatically; no stale PID-file lock can be reclaimed incorrectly.
      if (path !== ':memory:') this.db.pragma('locking_mode = EXCLUSIVE');
      this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON');
      this.db.exec('BEGIN IMMEDIATE; COMMIT;');
      this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, hash TEXT NOT NULL, applied_at TEXT NOT NULL)');
      const appliedRows = this.db.prepare('SELECT version, hash FROM schema_migrations ORDER BY version').all() as { version: number; hash: string }[];
      const applied = new Map(appliedRows.map((row) => [row.version, row.hash]));
      for (const migration of MIGRATIONS) {
        const known = applied.get(migration.version);
        if (known && known !== hash(migration.sql)) throw new Error('Schema database tidak kompatibel.');
      }
      for (const row of appliedRows) {
        if (!MIGRATIONS.some((migration) => migration.version === row.version)) throw new Error('Schema database tidak kompatibel.');
      }
      for (const migration of MIGRATIONS) {
        if (applied.has(migration.version)) continue;
        if (migration.version > 1 && !applied.has(migration.version - 1)) throw new Error('Schema database tidak kompatibel.');
        this.db.transaction(() => {
          this.db.exec(migration.sql);
          if (migration.version === 1) {
            for (const table of IMMUTABLE_TABLES) {
              this.db.exec(`CREATE TRIGGER immutable_${table}_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'append-only'); END; CREATE TRIGGER immutable_${table}_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'append-only'); END;`);
            }
          }
          this.db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(migration.version, hash(migration.sql), this.now());
        })();
        applied.set(migration.version, hash(migration.sql));
      }
      if (this.db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Integritas database gagal.');
    } catch (error) { this.db.close(); if ((error as { code?: string }).code === 'SQLITE_BUSY') throw new Error('Database sedang dipakai writer lain. Hentikan aplikasi pemilik database; proses lain tidak diubah.', { cause: error }); throw error; }
  }
  now() { return this.clock.now().toISOString(); }
  id() { return randomUUID(); }
  close() { if (this.db.open) this.db.close(); }
  transaction<T>(action: () => T): T { return this.db.transaction(action).immediate(); }
  private table(table: string) { if (!tables.has(table)) throw new Error('Tabel tidak dikenal.'); return table; }
  list<T>(table: string, where = '1=1', params: (string | number | null)[] = [], order = 'rowid ASC'): T[] {
    return (this.db.prepare(`SELECT data_json FROM ${this.table(table)} WHERE ${where} ORDER BY ${order}`).all(...params) as { data_json: string }[]).map((r) => JSON.parse(r.data_json) as T);
  }
  get<T>(table: string, id: string): T | undefined { return this.list<T>(table, 'id=?', [id])[0]; }
  put<T extends { id: string }>(table: string, value: T, fields: Record<string, string | number | null> = {}, insertOnly = false) {
    this.table(table);
    const entries = Object.entries({ id: value.id, data_json: canonical(value), ...fields });
    if (entries.some(([key]) => !/^[a-z_]+$/.test(key))) throw new Error('Kolom tidak valid.');
    const columns = entries.map(([key]) => key);
    const update = insertOnly ? '' : ` ON CONFLICT(id) DO UPDATE SET ${columns.filter((k) => k !== 'id').map((k) => `${k}=excluded.${k}`).join(',')}`;
    this.db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})${update}`).run(...entries.map(([, v]) => v));
    return value;
  }
  audit(kind: string, entityId: string, payload: unknown, actor = 'local') {
    this.put('audit_events', { id: this.id(), kind, entityId, actor, occurredAt: this.now(), payload }, {}, true);
  }
}
