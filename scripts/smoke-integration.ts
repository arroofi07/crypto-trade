import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTradingFixture } from '../tests/fixtures/trading.ts';
import { createApp } from '../apps/server/src/app.ts';
import { createLogger } from '../apps/server/src/logger.ts';
import { TelegramService } from '../apps/server/src/modules/telegram.ts';
import type { TelegramMessage } from '../apps/server/src/adapters/telegram.ts';
import { backup, restore } from '../apps/server/src/db/operations.ts';
import { Store } from '../apps/server/src/db/store.ts';

const directory = await mkdtemp(join(tmpdir(), 'memecoin full mock ')), f = createTradingFixture(join(directory, 'app.sqlite'));
const app = await createApp({ token: 'mock-only', port: 14318, clock: f.clock, services: f.services, serveUi: false, logger: createLogger('silent') });
try {
  const headers = { host: '127.0.0.1:14318', authorization: 'Bearer mock-only', 'idempotency-key': 'smoke-close' };
  const created = await app.inject({ method: 'POST', url: '/api/v1/experiments', headers, payload: { fxUsdIdr: '16000' } }); assert.equal(created.statusCode, 201);
  const portfolio = created.json().data.portfolios[1] as { id: string };
  const signal = await f.warmup(), sent: TelegramMessage[] = [];
  const telegram = new TelegramService(f.services, { poll: async () => [], acknowledge: async () => undefined, send: async (_chat, message) => { sent.push(message); return 'mock-message'; } }, '100', '42');
  await telegram.deliver(); const message = sent.find((m) => m.buttons?.length)!; assert.ok(message.text.includes(signal.id));
  const callback = { update_id: 1, callback_query: { id: 'mock-query', from: { id: 42, first_name: 'Fixture', is_bot: false }, chat_instance: 'mock-chat', data: message.buttons![0]![0]!.callback_data, message: { message_id: 1, date: 0, chat: { id: 100, type: 'private' as const, first_name: 'Fixture' } } } };
  await telegram.handle(callback); await telegram.handle(callback); assert.equal(f.store.list('entry_requests').length, 1);
  await f.observe('1.066'); const position = f.services.paper.list()[0]!; assert.equal(position.state, 'OPEN');
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/positions/${position.id}/close`, headers, payload: { confirmed: true } })).statusCode, 202);
  await f.observe('1.1'); assert.equal(f.services.paper.position(position.id).state, 'CLOSED');
  const report = await app.inject({ url: `/api/v1/performance?portfolioId=${portfolio.id}`, headers }); assert.equal(report.statusCode, 200); assert.equal(report.json().data.metrics.closedCount, 1);
  const csv = await app.inject({ url: `/api/v1/journal/export?portfolioId=${portfolio.id}`, headers }); assert.ok(csv.body.includes(position.id));
  const ledger = f.store.list('cash_ledger'), copy = await backup(f.store, join(directory, 'backups'));
  const restoredPath = join(directory, 'restored.sqlite'); await restore(copy, restoredPath);
  const restored = new Store(restoredPath); try { assert.deepEqual(restored.list('cash_ledger'), ledger); assert.equal(restored.list('positions').length, 1); } finally { restored.close(); }
  console.log('PASS: mock providers → onboarding → signal → Telegram callback/dedupe → next observation entry → confirmed exit → journal/CSV → verified backup/restore.');
} finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
