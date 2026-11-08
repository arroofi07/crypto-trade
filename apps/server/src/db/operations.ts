import Database from 'better-sqlite3';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, hash } from './store.ts';
import { sql001 } from './migrations/001.ts';
import { sql002 } from './migrations/002.ts';
import type { Decision, Signal } from '@memecoin/contracts';

function verify(db: Database.Database) {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Backup gagal pemeriksaan integritas.');
  const expected = [{ version: 1, hash: hash(sql001) }, { version: 2, hash: hash(sql002) }];
  const migrations = db.prepare('SELECT version,hash FROM schema_migrations ORDER BY version').all() as { version: number; hash: string }[];
  if (migrations.length !== expected.length || expected.some((row, index) => migrations[index]?.version !== row.version || migrations[index]?.hash !== row.hash)) throw new Error('Schema backup tidak kompatibel.');
}
export function verifyBackup(path: string) { const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 1000 }); try { verify(db); } finally { db.close(); } }
export async function backup(store: Store, directory = join(dirname(store.path), 'backups')) {
  const root = resolve(directory); await mkdir(root, { recursive: true });
  const path = join(root, `backup-${store.now().replaceAll(':','-')}-${randomUUID()}.sqlite`);
  await store.db.backup(`${path}.partial`); verifyBackup(`${path}.partial`); await rename(`${path}.partial`, path);
  const files = await Promise.all((await readdir(root)).filter((name) => /^backup-[\dT.Z-]+-[\da-f-]{36}\.sqlite$/.test(name)).map(async (name) => ({ path: join(root, name), modified: (await stat(join(root, name))).mtimeMs })));
  for (const file of files.sort((a, b) => b.modified - a.modified).slice(7)) await unlink(file.path);
  return path;
}
export async function restore(sourcePath: string, destinationPath: string) {
  const source = resolve(sourcePath), destination = resolve(destinationPath);
  if (source.toLowerCase() === destination.toLowerCase()) throw new Error('Sumber restore tidak boleh sama dengan database tujuan.');
  verifyBackup(source); await mkdir(dirname(destination), { recursive: true });
  let preRestore: string | null = null;
  if (existsSync(destination)) {
    const old = new Store(destination);
    try { preRestore = await backup(old, join(dirname(destination), 'pre-restore')); } finally { old.close(); }
  }
  const db = new Database(source, { readonly: true, fileMustExist: true, timeout: 1000 });
  try { await db.backup(destination); } finally { db.close(); }
  verifyBackup(destination); return { destination, preRestore };
}
export function retainSnapshots(store: Store) {
  const cutoff = new Date(store.clock.now().getTime() - 30 * 86400_000).toISOString();
  const protectedIds = new Set<string>();
  for (const signal of store.list<Signal>('signals')) { const snapshot = signal.evidence.snapshot as { id?: string } | undefined; if (snapshot?.id) protectedIds.add(snapshot.id); }
  for (const decision of store.list<Decision>('decisions')) { const snapshot = decision.evidence.snapshot as { id?: string } | undefined; if (snapshot?.id) protectedIds.add(snapshot.id); if (typeof decision.evidence.snapshotId === 'string') protectedIds.add(decision.evidence.snapshotId); }
  return store.transaction(() => {
    store.db.exec('CREATE TEMP TABLE IF NOT EXISTS retained_snapshot_ids(id TEXT PRIMARY KEY); DELETE FROM retained_snapshot_ids;');
    const insert = store.db.prepare('INSERT OR IGNORE INTO retained_snapshot_ids VALUES(?)'); for (const id of protectedIds) insert.run(id);
    const result = store.db.prepare(`DELETE FROM market_snapshots WHERE observed_at < ? AND id NOT IN (SELECT source_snapshot_id FROM fills) AND id NOT IN (SELECT id FROM retained_snapshot_ids) AND id NOT IN (SELECT id FROM market_snapshots AS latest WHERE observed_at=(SELECT MAX(observed_at) FROM market_snapshots WHERE pool_id=latest.pool_id))`).run(cutoff);
    store.db.exec('DELETE FROM retained_snapshot_ids;'); return result.changes;
  });
}
