import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timestampSchema } from '@memecoin/contracts';
import { z } from 'zod';
import { Services } from '../modules/services.ts';
import { registerEvents } from './events.ts';
import { AppError } from '../modules/settings.ts';

export function registerRoutes(app: FastifyInstance, services: Services) {
  registerEvents(app, services.events);
  const envelope = (req: FastifyRequest, data: unknown) => {
    const meta = { requestId: req.id, observedAt: timestampSchema.parse(services.store.now()) };
    if (!Array.isArray(data)) return { data, meta };
    const { cursor, limit } = z.object({ cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const start = cursor ? data.findIndex((item: { id: string }) => item.id === cursor) + 1 : 0;
    if (cursor && start === 0) throw new AppError(400, 'INVALID_REQUEST', 'Cursor tidak tersedia pada filter ini. Muat ulang daftar.');
    const page = data.slice(start, start + limit) as { id: string }[];
    return { data: page, meta: { ...meta, limit, nextCursor: start + limit < data.length ? page.at(-1)!.id : null } };
  };
  app.get('/api/v1/performance', async (req) => envelope(req, services.performance.report(req.query)));
  app.get('/api/v1/journal/export', async (req, reply) => reply.type('text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="simulasi-jurnal.csv"').send(services.performance.csv(req.query)));
  app.get('/api/v1/settings', async (req) => envelope(req, { ...services.settings.settings(), configs: services.settings.configs(), activeExperimentId: services.settings.activeExperiment() }));
  app.patch('/api/v1/settings', async (req) => envelope(req, services.settings.update(req.body)));
  app.get('/api/v1/experiments', async (req) => envelope(req, services.settings.experiments()));
  app.post('/api/v1/experiments', async (req, reply) => { reply.code(201); return envelope(req, services.settings.create(req.body)); });
  app.get('/api/v1/portfolios', async (req) => envelope(req, services.settings.portfolios().map((p) => { const v = services.risk.valuation(p.id); return { ...p, equityIdr: v.equityIdr, availableCashIdr: v.availableCashIdr, reservedCashIdr: v.reservedCashIdr, openRiskIdr: v.openRiskIdr, unpriced: v.unpriced, daily: services.risk.daily(p.id, v.equityIdr) }; })));
  app.get('/api/v1/watchlist', async (req) => envelope(req, services.market.tokens().filter((t) => t.watchlistEnabled).map((t) => services.market.detail(t.mint))));
  app.post('/api/v1/watchlist', async (req, reply) => { reply.code(201); return envelope(req, services.market.add(req.body)); });
  const mint = (req: FastifyRequest) => z.object({ mint: z.string() }).parse(req.params).mint;
  app.delete('/api/v1/watchlist/:mint', async (req) => envelope(req, services.market.remove(mint(req))));
  app.get('/api/v1/discovery', async (req) => envelope(req, services.discovery.list()));
  app.post('/api/v1/discovery/:mint/promote', async (req, reply) => { reply.code(201); return envelope(req, services.discovery.promote(mint(req))); });
  app.post('/api/v1/discovery/:mint/dismiss', async (req) => envelope(req, services.discovery.dismiss(mint(req))));
  app.get('/api/v1/tokens/:mint', async (req) => { const token = services.market.detail(mint(req)); return envelope(req, { ...token, security: services.security.latest(token.id) ?? null, securityFresh: services.security.valid(token.id) }); });
  app.get('/api/v1/tokens/:mint/series', async (req) => envelope(req, services.market.series(mint(req))));
  app.get('/api/v1/tokens/:mint/txn-series', async (req) => envelope(req, services.market.txnSeries(mint(req))));
  app.get('/api/v1/news', async (req) => { const query = z.object({ mint: z.string().optional(), matchStatus: z.enum(['EXACT_REFERENCE','UNVERIFIED_MATCH','MARKET_CONTEXT']).optional() }).parse(req.query); return envelope(req, services.news.list(query.mint).filter((n) => !query.matchStatus || n.matchStatus === query.matchStatus)); });
  app.post('/api/v1/news', async (req, reply) => { reply.code(201); return envelope(req, services.news.add(req.body)); });
  app.get('/api/v1/signals', async (req) => { const query = z.object({ state: z.enum(['VALID','EXPIRED','INVALIDATED']).optional(), mint: z.string().optional() }).parse(req.query); return envelope(req, services.signals.list().filter((s) => (!query.state || s.state === query.state) && (!query.mint || s.token.mint === query.mint))); });
  app.get('/api/v1/signals/:id', async (req) => envelope(req, services.signals.get(z.object({ id: z.uuid() }).parse(req.params).id)));
  app.post('/api/v1/signals/:id/preview', async (req) => envelope(req, services.risk.preview(z.object({ id: z.uuid() }).parse(req.params).id, z.object({ portfolioId: z.uuid() }).strict().parse(req.body).portfolioId)));
  const key = (req: FastifyRequest) => z.string().min(1).max(120).parse(req.headers['idempotency-key']);
  app.post('/api/v1/paper/entries', async (req, reply) => {
    const body = z.object({ signalId: z.uuid(), portfolioId: z.uuid() }).strict().parse(req.body);
    const entry = services.paper.request(body.signalId, body.portfolioId, key(req)); reply.code(202); return envelope(req, entry);
  });
  app.get('/api/v1/paper/entries/:id', async (req) => envelope(req, services.paper.entry(z.object({ id: z.uuid() }).parse(req.params).id)));
  app.get('/api/v1/positions', async (req) => { const query = z.object({ portfolioId: z.uuid().optional(), state: z.enum(['OPEN','UNPRICED','CLOSED']).optional() }).parse(req.query); return envelope(req, services.paper.list(query.portfolioId).filter((p) => !query.state || p.state === query.state)); });
  app.post('/api/v1/positions/:id/close', async (req, reply) => {
    const id = z.object({ id: z.uuid() }).parse(req.params).id, body = z.object({ confirmed: z.literal(true) }).strict().parse(req.body);
    const position = services.paper.requestClose(id, key(req), body.confirmed); reply.code(202); return envelope(req, position);
  });
}
