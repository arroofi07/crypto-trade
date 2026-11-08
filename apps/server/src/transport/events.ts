import type { FastifyInstance } from 'fastify';
import type { DomainEvent } from '@memecoin/contracts';
import { Events } from '../modules/events.ts';

export function registerEvents(app: FastifyInstance, events: Events) {
  const clients = new Set<() => void>();
  app.get('/api/v1/events', async (_req, reply) => {
    reply.hijack();
    for (const [name, value] of Object.entries(reply.getHeaders())) if (value !== undefined) reply.raw.setHeader(name, value);
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    reply.raw.write('event: ready\ndata: {}\n\n');
    const send = (event: DomainEvent) => {
      if (reply.raw.writableLength > 64 * 1024) { reply.raw.end(); return; }
      reply.raw.write(`id: ${event.id}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => { reply.raw.write(': heartbeat\n\n'); }, 15_000).unref();
    const close = () => { clearInterval(heartbeat); events.emitter.off('event', send); clients.delete(close); if (!reply.raw.destroyed) reply.raw.end(); };
    clients.add(close); events.emitter.on('event', send); reply.raw.once('close', close);
  });
  app.addHook('preClose', async () => { for (const close of clients) close(); });
}
