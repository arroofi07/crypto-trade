import { Api, GrammyError } from 'grammy';
import type { Update } from 'grammy/types';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../db/store.ts';

export interface TelegramMessage { text: string; expiresAt?: string; signalId?: string; buttons?: { text: string; callback_data: string }[][] }
export interface TelegramTransport {
  poll(offset: number, signal: AbortSignal): Promise<Update[]>;
  send(chatId: string, message: TelegramMessage): Promise<string>;
  acknowledge(id: string): Promise<void>;
  close?(): void;
}
export class DeliveryError extends Error {
  readonly kind: 'RETRY' | 'DEAD' | 'DELIVERY_UNKNOWN'; readonly retrySeconds: number;
  constructor(kind: 'RETRY' | 'DEAD' | 'DELIVERY_UNKNOWN', retrySeconds = 30) { super(kind); this.kind = kind; this.retrySeconds = retrySeconds; }
}
export function telegramConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.TELEGRAM_ENABLED !== 'true') return null;
  const token = env.TELEGRAM_BOT_TOKEN, chatId = env.TELEGRAM_CHAT_ID, userId = env.TELEGRAM_USER_ID;
  if (!token || !/^\d+:[\w-]+$/.test(token) || !chatId || !/^-?\d+$/.test(chatId) || !userId || !/^\d+$/.test(userId)) throw new Error('Konfigurasi Telegram belum lengkap atau tidak valid.');
  return { token, chatId, userId };
}
export class GrammyTransport implements TelegramTransport {
  private readonly api: Api;
  private readonly lockPath: string; private lock: Store | undefined;
  constructor(token: string) { this.api = new Api(token, { timeoutSeconds: 40 }); this.lockPath = join(tmpdir(), 'memecoin-polling-locks', `${createHash('sha256').update(token).digest('hex')}.sqlite`); }
  poll(offset: number, signal: AbortSignal) {
    if (!this.lock?.db.open) this.lock = new Store(this.lockPath);
    // grammY types retain the legacy AbortSignal shim; Node's native signal implements the consumed API.
    return this.api.getUpdates({ offset, timeout: 25, allowed_updates: ['message','callback_query'], limit: 50 }, signal as unknown as Parameters<Api['getUpdates']>[1]);
  }
  async send(chatId: string, message: TelegramMessage) {
    try {
      // Plain text, no parse_mode: token names and titles cannot inject Telegram markup.
      const result = await this.api.sendMessage(chatId, message.text.slice(0, 4000), { link_preview_options: { is_disabled: true }, ...(message.buttons ? { reply_markup: { inline_keyboard: message.buttons } } : {}) });
      return String(result.message_id);
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === 429) throw new DeliveryError('RETRY', error.parameters.retry_after ?? 30);
      if (error instanceof GrammyError && error.error_code >= 400 && error.error_code < 500) throw new DeliveryError('DEAD');
      // Network timeout/5xx may happen after Telegram accepted a send. Never retry blindly.
      throw new DeliveryError('DELIVERY_UNKNOWN');
    }
  }
  async acknowledge(id: string) { await this.api.answerCallbackQuery(id).catch(() => undefined); }
  close() { this.lock?.close(); }
}
