import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { get } from 'node:http';
import { createConnection, createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://127.0.0.1:4317';
// Reserve first; never attach to or terminate somebody else's server.
const probe = createServer();
await new Promise<void>((resolve, reject) => {
  probe.once('error', () => reject(new Error('Smoke membutuhkan port 4317 kosong; proses lain tidak diubah.')));
  probe.listen(4317, '127.0.0.1', resolve);
});
await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));

const temporary = await mkdtemp(join(tmpdir(), 'memecoin runtime smoke '));
function launch(ipc: boolean, sameDatabase = false) {
  const child = spawn(process.execPath, [ipc ? 'tests/fixtures/runtime-child.mjs' : 'apps/server/dist/main.js'], {
    env: { ...process.env, PORT: sameDatabase ? '14319' : '4317', OPEN_BROWSER: 'false', LOG_LEVEL: 'info', TELEGRAM_ENABLED: 'false', DATA_DIR: join(temporary, ipc || sameDatabase ? 'primary data' : 'port contender data') },
    windowsHide: true,
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  return { child, logs: () => logs };
}
async function exitWithin(child: ChildProcess) {
  if (child.exitCode !== null) return child.exitCode;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try { return (await once(child, 'exit', { signal: controller.signal }))[0] as number; }
  finally { clearTimeout(timer); }
}
async function reachable(host: string) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port: 4317 });
    socket.setTimeout(1000);
    const finish = (result: boolean) => { socket.destroy(); resolve(result); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

const primary = launch(true);
let contender: ReturnType<typeof launch> | undefined;
let writer: ReturnType<typeof launch> | undefined;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (primary.child.exitCode !== null) throw new Error('Server smoke gagal start.');
    if (primary.logs().includes('Server listening')) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, 'server becomes ready');
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Memecoin Trade/);
  assert.equal((await fetch(`${origin}/api/v1/health`)).status, 401);
  assert.equal((await fetch(origin, { headers: { Origin: 'https://evil.test' } })).status, 403);
  const foreignHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = get(origin, { headers: { Host: 'evil.test:4317' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.once('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
  for (const address of Object.values(networkInterfaces()).flat()) {
    if (address?.family === 'IPv4' && !address.internal) {
      assert.equal(await reachable(address.address), false, 'server must not listen on LAN interfaces');
    }
  }
  contender = launch(false);
  assert.equal(await exitWithin(contender.child), 1);
  assert.match(contender.logs(), /Port 4317 sedang dipakai/);
  assert.equal((await fetch(origin)).status, 200, 'existing server survives occupied-port error');
  writer = launch(false, true);
  assert.equal(await exitWithin(writer.child), 1); assert.match(writer.logs(), /writer lain/);
  primary.child.send('shutdown');
  assert.equal(await exitWithin(primary.child), 0);
  assert.match(primary.logs(), /Server berhenti/);
  assert.doesNotMatch(primary.logs() + contender.logs(), /#session=|Bearer /);
  assert.equal(await reachable('127.0.0.1'), false, 'shutdown releases the port');
  console.log('PASS: production UI, protected health, Host/Origin, loopback bind, occupied port, single DB writer, paths with spaces, log hygiene, graceful shutdown.');
} finally {
  for (const process of [primary, contender, writer]) {
    if (process && process.child.exitCode === null) { process.child.kill(); await exitWithin(process.child); }
  }
  await rm(temporary, { recursive: true, force: true });
}
