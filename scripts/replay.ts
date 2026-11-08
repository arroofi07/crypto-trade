import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { sensitivity } from '../apps/server/src/replay.ts';

const source = process.argv[2], destination = process.argv[3];
if (!source || !destination) throw new Error('Penggunaan: pnpm replay recording.json output-directory');
const runs = await sensitivity(JSON.parse(await readFile(source, 'utf8')));
const directory = resolve(destination); await mkdir(directory, { recursive: true });
for (const run of runs) await writeFile(join(directory, `${run.scenario.name}-${run.runId}.json`), JSON.stringify(run, null, 2), { flag: 'wx' });
console.log(`${runs.length} run terpisah tersimpan. Tidak ada koneksi provider atau transaksi nyata.`);
