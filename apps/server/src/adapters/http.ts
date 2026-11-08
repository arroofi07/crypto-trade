import { setTimeout as sleep } from 'node:timers/promises';
import type { Clock } from '@memecoin/domain';
import { systemClock } from '@memecoin/domain';

export class ProviderError extends Error { readonly code: string; constructor(code: string) { super('Provider tidak tersedia.'); this.code = code; } }
export interface HttpOptions { fetch?: typeof fetch; clock?: Clock; wait?: (ms: number) => Promise<unknown>; random?: () => number; budget?: number; timeoutMs?: number }
export class HttpClient {
  private readonly options: HttpOptions;
  private requests: number[] = [];
  private active = 0;
  private blockedUntil = 0;
  constructor(options: HttpOptions = {}) { this.options = options; }
  async json(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.text(url, init);
    try { return JSON.parse(response); } catch { throw new ProviderError('INVALID_SCHEMA'); }
  }
  async text(url: string, init: RequestInit = {}): Promise<string> {
    const clock = this.options.clock ?? systemClock;
    if (this.active >= 2) throw new ProviderError('CONCURRENCY_LIMIT');
    this.active += 1;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const now = clock.now().getTime();
        this.requests = this.requests.filter((time) => time > now - 60_000);
        if (now < this.blockedUntil || this.requests.length >= (this.options.budget ?? 30)) throw new ProviderError('RATE_LIMITED');
        this.requests.push(now);
        let retryAfter = 0;
        try {
          const response = await (this.options.fetch ?? fetch)(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000) });
          if (response.status === 429) {
            const header = response.headers.get('retry-after') ?? '1';
            retryAfter = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Math.max(1000, Date.parse(header) - now);
            if (!Number.isFinite(retryAfter)) retryAfter = 1000;
            this.blockedUntil = now + retryAfter;
            await response.body?.cancel();
            throw new ProviderError('RATE_LIMITED');
          }
          if (!response.ok) { await response.body?.cancel(); throw new ProviderError(response.status >= 500 ? 'UPSTREAM_ERROR' : 'HTTP_REJECTED'); }
          if (Number(response.headers.get('content-length')) > 2_000_000) { await response.body?.cancel(); throw new ProviderError('RESPONSE_TOO_LARGE'); }
          const reader = response.body?.getReader();
          if (!reader) throw new ProviderError('EMPTY_RESPONSE');
          const chunks: Uint8Array[] = []; let size = 0;
          try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 2_000_000) throw new ProviderError('RESPONSE_TOO_LARGE'); chunks.push(next.value); } }
          finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
          return Buffer.concat(chunks).toString('utf8');
        } catch (error) {
          const code = error instanceof ProviderError ? error.code : 'NETWORK_TIMEOUT';
          if (attempt === 2 || ['HTTP_REJECTED','RESPONSE_TOO_LARGE','EMPTY_RESPONSE'].includes(code) || retryAfter > 60_000) throw new ProviderError(code);
          await (this.options.wait ?? sleep)(Math.max(retryAfter, 500 * 2 ** attempt + (this.options.random ?? Math.random)() * 250));
        }
      }
      throw new ProviderError('UNAVAILABLE');
    } finally { this.active -= 1; }
  }
}
