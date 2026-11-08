import { createApp } from '../../apps/server/src/app.ts';
import { createLogger } from '../../apps/server/src/logger.ts';
import { testToken } from '../fixtures/session.ts';
import { createTradingFixture } from '../fixtures/trading.ts';

export default async function setup() {
  const fixture = createTradingFixture();
  fixture.services.market.remove(fixture.token.mint);
  const app = await createApp({ token: testToken, port: 14317, logger: createLogger('silent'), services: fixture.services, clock: fixture.clock });
  app.post('/api/v1/__fixture/warmup', async () => { await fixture.warmup(); return { ok: true }; });
  app.post('/api/v1/__fixture/observe', async (request) => { await fixture.observe((request.body as { price: string }).price); return { ok: true }; });
  try { await app.listen({ host: '127.0.0.1', port: 14317 }); }
  catch (error) { await app.close(); throw error; }
  return async () => { await app.close(); };
}
