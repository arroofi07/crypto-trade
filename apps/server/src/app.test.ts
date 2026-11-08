import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '@memecoin/domain';
import { errorEnvelopeSchema, healthResponseSchema } from '@memecoin/contracts';
import { createApp } from './app.js';
import { createLogger } from './logger.js';
import { bootstrapUrl, createSessionToken } from './session.js';
import { readConfig } from './config.js';

const token = createSessionToken();
const host = '127.0.0.1:4317';
const authorized = { host, authorization: `Bearer ${token}` };
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function setup(devOrigin?: string, logger = createLogger('silent')) {
  const app = await createApp({ token, port: 4317, serveUi: false, logger,
    clock: new FakeClock('2026-10-22T00:00:00.000Z'), ...(devOrigin ? { devOrigin } : {}) });
  apps.push(app);
  return app;
}

describe('local API boundary', () => {
  it('returns schema-valid, honest health using the injected clock', async () => {
    const app = await setup();
    const response = await app.inject({ url: '/api/v1/health', headers: { ...authorized, 'x-request-id': 'untrusted' } });
    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.meta.observedAt).toBe('2026-10-22T00:00:00.000Z');
    expect(body.data.database).toBe('not_configured');
    expect(body.data.providers).toBe('not_implemented');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain(token);
  });
  it.each([undefined, 'Bearer wrong', `Basic ${token}`, `Bearer ${token}extra`])('rejects invalid auth: %s', async (authorization) => {
    const app = await setup();
    const response = await app.inject({ url: '/api/v1/health', headers: { host, ...(authorization ? { authorization } : {}) } });
    expect(response.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('UNAUTHORIZED');
  });
  it('does not accept a query-string token or expose future API routes without auth', async () => {
    const app = await setup();
    for (const url of [`/api/v1/health?token=${token}`, '/api/v1/events', '/api/v1/settings']) {
      expect((await app.inject({ url, headers: { host } })).statusCode).toBe(401);
    }
  });
  it.each(['evil.test:4317', 'localhost:4317', '127.0.0.1:9999', '127.0.0.1:4317.evil.test'])('rejects Host %s', async (badHost) => {
    const app = await setup();
    const response = await app.inject({ url: '/api/v1/health', headers: { ...authorized, host: badHost } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN_HOST');
  });
  it.each(['https://evil.test', 'null', 'http://127.0.0.1:4317.evil.test', 'http://127.0.0.1:5173'])('rejects Origin %s in production', async (origin) => {
    const app = await setup();
    const response = await app.inject({ url: '/api/v1/health', headers: { ...authorized, origin } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN_ORIGIN');
  });
  it('permits only configured dev CORS and still authenticates the actual request', async () => {
    const app = await setup('http://127.0.0.1:5173');
    const headers = { host, origin: 'http://127.0.0.1:5173', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' };
    const preflight = await app.inject({ method: 'OPTIONS', url: '/api/v1/health', headers });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(headers.origin);
    expect((await app.inject({ url: '/api/v1/health', headers })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/v1/health', headers: { ...headers, ...authorized } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'OPTIONS', url: '/api/v1/health', headers: { ...headers, origin: 'https://evil.test' } })).statusCode).toBe(403);
  });
  it('requires JSON for mutations and sanitizes parser errors', async () => {
    const app = await setup();
    app.post('/api/v1/test', async () => ({ ok: true }));
    expect((await app.inject({ method: 'POST', url: '/api/v1/test', headers: authorized, payload: 'text' })).statusCode).toBe(415);
    const badJson = await app.inject({ method: 'POST', url: '/api/v1/test', headers: { ...authorized, 'content-type': 'application/json' }, payload: `{"secret":"${token}` });
    expect(badJson.statusCode).toBe(400);
    expect(errorEnvelopeSchema.safeParse(badJson.json()).success).toBe(true);
    expect(badJson.body).not.toContain(token);
    expect((await app.inject({ method: 'POST', url: '/api/v1/test', headers: authorized, payload: { ok: true } })).statusCode).toBe(200);
  });
  it('redacts credentials and never logs request URL, headers, body, or raw errors', async () => {
    let logs = '';
    const destination = new Writable({ write(chunk, _encoding, callback) { logs += String(chunk); callback(); } });
    const logger = createLogger('info', destination);
    const app = await setup(undefined, logger);
    app.get('/api/v1/fail', async () => { throw new Error(token); });
    await app.inject({ url: `/api/v1/health?token=${token}`, headers: { ...authorized, cookie: token } });
    await app.inject({ url: '/api/v1/fail', headers: authorized });
    logger.info({ token, sessionToken: token, bootstrapUrl: bootstrapUrl('http://127.0.0.1:4317', token), req: { headers: { authorization: token } } }, 'redaction');
    expect(logs).toContain('Permintaan selesai');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain('?token=');
  });
});

it('uses a random in-memory session and puts the bootstrap credential only in a fragment', () => {
  expect(createSessionToken()).not.toBe(token);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const url = new URL(bootstrapUrl('http://127.0.0.1:4317', token));
  expect(url.search).toBe('');
  expect(url.hash).toBe(`#session=${token}`);
});

it('validates local configuration without echoing arbitrary input', () => {
  expect(readConfig({}).host).toBe('127.0.0.1');
  expect(readConfig({}).port).toBe(4317);
  for (const env of [{ PORT: '0' }, { DEV_ORIGIN: 'https://evil.test' }, { DEV_ORIGIN: 'http://127.0.0.1:5173/' }, { OPEN_BROWSER: 'yes' }]) {
    expect(() => readConfig(env)).toThrow('Konfigurasi');
  }
});
