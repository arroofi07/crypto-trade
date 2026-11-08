import { z } from 'zod';
import { errorEnvelopeSchema, successEnvelopeSchema } from '@memecoin/contracts';
import { clearSession, takeSession } from './session';

export const token = takeSession();
const origin = import.meta.env.VITE_API_ORIGIN ?? '';
let offset = 0;
export const serverNow = () => Date.now() + offset;
export async function api<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token ?? ''}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'; if (options.key) headers['Idempotency-Key'] = options.key;
  let response: Response;
  try { response = await fetch(`${origin}/api/v1${path}`, { method: options.method ?? 'GET', headers, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(10_000), ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) }); }
  catch { throw new Error('Backend tidak terjangkau. Pastikan peluncur lokal berjalan.'); }
  if (response.status === 401) { clearSession(); throw new Error('Sesi kedaluwarsa. Mulai ulang peluncur lokal untuk sesi baru.'); }
  const body: unknown = await response.json();
  if (!response.ok) { const error = errorEnvelopeSchema.safeParse(body); throw new Error(error.success ? error.data.error.message : 'Permintaan gagal.'); }
  const parsed = successEnvelopeSchema(schema).safeParse(body);
  if (!parsed.success) throw new Error('Respons backend tidak sesuai kontrak.');
  offset = Date.parse(parsed.data.meta.observedAt) - Date.now();
  if (Array.isArray(parsed.data.data) && parsed.data.meta.nextCursor) {
    const [pathname, search] = path.split('?'), query = new URLSearchParams(search); query.set('cursor', parsed.data.meta.nextCursor);
    const next = await api(`${pathname}?${query}`, schema, options);
    if (Array.isArray(next)) return [...parsed.data.data, ...next] as T;
  }
  return parsed.data.data;
}
export async function stream(signal: AbortSignal, update: () => void, state: (connected: boolean) => void) {
  let attempt = 0;
  while (!signal.aborted) {
    state(false);
    const connection = new AbortController(); let watchdog = setTimeout(() => connection.abort(), 30_000);
    try {
      const response = await fetch(`${origin}/api/v1/events`, { headers: { Authorization: `Bearer ${token ?? ''}` }, signal: AbortSignal.any([signal, connection.signal]), cache: 'no-store' });
      if (response.status === 401) { clearSession(); return; }
      if (!response.ok || !response.body) throw new Error('Stream gagal');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = ''; attempt = 0;
      try {
        while (!signal.aborted) {
          const item = await reader.read(); if (item.done) throw new Error('Stream terputus');
          clearTimeout(watchdog); watchdog = setTimeout(() => connection.abort(), 30_000);
          buffer += decoder.decode(item.value, { stream: true });
          if (buffer.length > 1_000_000) throw new Error('Stream invalid');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) { const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); if (event.startsWith(':')) continue; state(true); update(); }
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } catch { state(false); } finally { clearTimeout(watchdog); connection.abort(); }
    if (signal.aborted) break;
    await new Promise<void>((resolve) => { const onAbort = () => { clearTimeout(timer); resolve(); }; const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, Math.min(30_000, 1000 * 2 ** attempt++)); signal.addEventListener('abort', onAbort, { once: true }); });
  }
}
