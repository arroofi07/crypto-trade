import { resolve } from 'node:path';
import { Store } from '../apps/server/src/db/store.ts';
import { backup, restore } from '../apps/server/src/db/operations.ts';

const command = process.argv[2], database = resolve(process.env.DATA_DIR ?? 'data', 'memecoin.sqlite');
if (command === 'backup') {
  const store = new Store(database);
  try { console.log(`Backup terverifikasi: ${await backup(store)}`); } finally { store.close(); }
} else if (command === 'restore' && process.argv[3]) {
  const result = await restore(process.argv[3], database); console.log(`Restore terverifikasi. Backup sebelum restore: ${result.preRestore ?? 'database baru'}`);
} else throw new Error('Penggunaan: pnpm db:backup atau pnpm db:restore path-backup.sqlite. Hentikan aplikasi terlebih dahulu.');
