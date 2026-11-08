import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify, { LogController } from 'fastify';
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Logger } from 'pino';
import { healthResponseSchema, timestampSchema } from '@memecoin/contracts';
import type { ApiErrorCode, ErrorEnvelope } from '@memecoin/contracts';
import { systemClock } from '@memecoin/domain';
import type { Clock } from '@memecoin/domain';
import { createLogger } from './logger.ts';
import { validAuthorization } from './session.ts';
import { ZodError } from 'zod';
import { AppError } from './modules/settings.ts';
import type { Services } from './modules/services.ts';
import { registerRoutes } from './transport/routes.ts';

export interface AppOptions {
  token: string;
  port: number;
  devOrigin?: string;
  clock?: Clock;
  logger?: Logger;
  serveUi?: boolean;
  services?: Services;
}

export async function createApp(options: AppOptions) {
  const clock = options.clock ?? systemClock;
  const origin = `http://127.0.0.1:${options.port}`;
  const allowedOrigins = new Set([origin, ...(options.devOrigin ? [options.devOrigin] : [])]);
  const app = Fastify({
    loggerInstance: (options.logger ?? createLogger()) as FastifyBaseLogger,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
    forceCloseConnections: true,
  });
  function fail(req: FastifyRequest, reply: FastifyReply, status: number, code: ApiErrorCode, message: string) {
    const body: ErrorEnvelope = { error: { code, message }, requestId: req.id };
    return reply.code(status).send(body);
  }

  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (req.headers.host !== `127.0.0.1:${options.port}`) {
      return fail(req, reply, 403, 'FORBIDDEN_HOST', 'Host tidak diizinkan.');
    }
    const requestOrigin = req.headers.origin;
    if (requestOrigin !== undefined && !allowedOrigins.has(requestOrigin)) {
      return fail(req, reply, 403, 'FORBIDDEN_ORIGIN', 'Origin tidak diizinkan.');
    }
    const isApi = /^\/api(?:\/|\?|$)/.test(req.url);
    const isPreflight = req.method === 'OPTIONS' && requestOrigin !== undefined && req.headers['access-control-request-method'] !== undefined;
    if (isApi && !isPreflight && !validAuthorization(req.headers.authorization, options.token)) {
      return fail(req, reply, 401, 'UNAUTHORIZED', 'Sesi tidak valid. Buka dashboard melalui peluncur lokal.');
    }
    if (isApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
        req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      return fail(req, reply, 415, 'JSON_REQUIRED', 'Mutasi API harus memakai application/json.');
    }
  });

  await app.register(cors, {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    credentials: false,
    strictPreflight: true,
  });
  app.addHook('onResponse', async (req, reply) => {
    req.log.info({ method: req.method, statusCode: reply.statusCode }, 'Permintaan selesai.');
  });
  app.get('/api/v1/health', async (req) => healthResponseSchema.parse({
    data: options.services?.health() ?? {
      application: 'ready', mode: 'setup', database: 'not_configured',
      providers: 'not_implemented', scheduler: 'not_implemented', lastJobAt: null,
      dataGap: 'unknown', telegram: 'disabled',
    },
    meta: { requestId: req.id, observedAt: timestampSchema.parse(clock.now().toISOString()) },
  }));
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) return fail(req, reply, error.statusCode, error.code, error.message);
    if (error instanceof ZodError) return fail(req, reply, 400, 'INVALID_REQUEST', 'Parameter tidak valid. Periksa format dan batas input.');
    const errorStatus = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
    if (status === 500) req.log.error('Permintaan gagal karena kesalahan internal.');
    return fail(req, reply, status, status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      status === 500 ? 'Terjadi kesalahan internal.' : 'Permintaan tidak valid.');
  });
  app.setNotFoundHandler((req, reply) => fail(req, reply, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.'));
  if (options.services) {
    registerRoutes(app, options.services);
    app.addHook('onClose', async () => { await options.services!.close(); });
  }
  if (options.serveUi !== false) {
    await app.register(fastifyStatic, {
      root: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
      index: 'index.html',
      cacheControl: false,
    });
  }
  return app;
}
