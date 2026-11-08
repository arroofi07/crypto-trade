import { expect, it } from 'vitest';
import type { Update } from 'grammy/types';
import type { OutboxEvent } from '@memecoin/contracts';
import { createTradingFixture } from '../../../../tests/fixtures/trading.ts';
import { TelegramService } from './telegram.ts';
import { DeliveryError, telegramConfig } from '../adapters/telegram.ts';
import type { TelegramMessage, TelegramTransport } from '../adapters/telegram.ts';

function transport() { const sent: TelegramMessage[] = []; const mock: TelegramTransport = { poll: async () => [], send: async (_chat, message) => { sent.push(message); return String(sent.length); }, acknowledge: async () => undefined }; return { mock, sent }; }
function update(id: number, text: string, callback = false, user = 42): Update { return callback ? { update_id: id, callback_query: { id: String(id), from: { id: user, is_bot: false, first_name: '<user>' }, chat_instance: 'fixture', data: text, message: { message_id: 1, date: 1, chat: { id: 100, type: 'private', first_name: 'Fixture' } } } } : { update_id: id, message: { message_id: id, date: 1, text, chat: { id: 100, type: 'private', first_name: 'Fixture' }, from: { id: user, is_bot: false, first_name: 'Fixture' } } }; }

it('allowlists both identities; opaque callbacks revalidate and remain idempotent after checkpoint reload', async () => {
  const f = createTradingFixture(), { mock, sent } = transport();
  try {
    const signal = await f.warmup(), manual = f.services.settings.create({ fxUsdIdr: '16000' }).portfolios[1]!;
    const telegram = new TelegramService(f.services, mock, '100', '42');
    await telegram.handle(update(1, '/signals', false, 99)); expect(f.store.list('telegram_callbacks')).toHaveLength(0);
    await telegram.handle(update(2, '/signals')); await telegram.deliver();
    const message = sent.find((m) => m.buttons?.length)!; expect(message.text).toContain(signal.token.mint); expect(message.text).toContain('SIMULASI');
    const key = message.buttons![0]![0]!.callback_data; expect(key).toMatch(/^[\da-f-]{36}$/);
    await telegram.handle(update(3, key, true)); await telegram.handle(update(4, key, true));
    const restarted = new TelegramService(f.services, mock, '100', '42'); await restarted.handle(update(4, key, true));
    expect(f.store.list('entry_requests')).toHaveLength(1); expect(f.services.risk.pending(manual.id)).toHaveLength(1);
    await f.observe('1.066'); await telegram.handle(update(5, '/positions')); await telegram.deliver(); await telegram.deliver();
    const close = sent.find((m) => m.buttons?.[0]?.[0]?.text.startsWith('Tutup'))!.buttons![0]![0]!.callback_data;
    await telegram.handle(update(6, close, true)); expect(f.store.list('exit_intents')).toHaveLength(0); await telegram.deliver();
    const confirm = sent.find((m) => m.buttons?.[0]?.[0]?.text === 'Konfirmasi exit')!.buttons![0]![0]!.callback_data;
    await telegram.handle(update(7, confirm, true)); expect(f.store.list('exit_intents')).toHaveLength(1);
    expect(f.services.paper.list()[0]!.state).toBe('OPEN'); await f.observe('1.1'); expect(f.services.paper.list()[0]!.state).toBe('CLOSED');
    f.clock.advance(180_000); await telegram.handle(update(8, key, true)); await telegram.deliver(); expect(sent.at(-1)!.text).toContain('kedaluwarsa');
  } finally { await f.services.close(); }
});
it('never retries ambiguous delivery; rate-limit is retryable and crashed SENDING becomes unknown', async () => {
  const f = createTradingFixture(), { mock } = transport();
  try {
    const telegram = new TelegramService(f.services, mock, '100', '42'); await telegram.handle(update(1, '/help'));
    let sends = 0; mock.send = async () => { sends++; throw new DeliveryError('DELIVERY_UNKNOWN'); };
    await telegram.deliver(); await telegram.deliver(); expect(sends).toBe(1); expect(telegram.health()).toBe('delivery_unknown');
    await telegram.handle(update(2, '/help')); mock.send = async () => { throw new DeliveryError('RETRY', 10); }; await telegram.deliver();
    expect(f.store.list<OutboxEvent>('outbox', "state='RETRY'")).toHaveLength(1);
    const row = f.store.list<OutboxEvent>('outbox', "state='RETRY'")[0]!; f.store.put('outbox', { ...row, state: 'SENDING' }, { dedupe_key: row.dedupeKey, state: 'SENDING', next_attempt_at: row.nextAttemptAt });
    telegram.recover(); expect(f.store.list('outbox', "state='DELIVERY_UNKNOWN'")).toHaveLength(2);
  } finally { await f.services.close(); }
});
it('drops expired queued signal messages and defaults to no live transport', async () => {
  expect(telegramConfig({})).toBeNull(); expect(() => telegramConfig({ TELEGRAM_ENABLED: 'true' })).toThrow('Konfigurasi');
  const f = createTradingFixture(), { mock, sent } = transport();
  try { await f.warmup(); const telegram = new TelegramService(f.services, mock, '100', '42'); await telegram.handle(update(1, '/signals')); f.clock.advance(121_000); await telegram.deliver(); expect(sent).toHaveLength(0); } finally { await f.services.close(); }
});
