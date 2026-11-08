import { createServer } from 'vite';
import { createApp } from '../apps/server/src/app.ts';
import { readConfig } from '../apps/server/src/config.ts';
import { createLogger } from '../apps/server/src/logger.ts';
import { bootstrapUrl, createSessionToken, openDashboard } from '../apps/server/src/session.ts';
import { Store } from '../apps/server/src/db/store.ts';
import { Services } from '../apps/server/src/modules/services.ts';
import { GrammyTransport, telegramConfig } from '../apps/server/src/adapters/telegram.ts';
import { resolve } from 'node:path';

const config = readConfig();
const logger = createLogger(config.logLevel);
const token = createSessionToken();
const devUrl = new URL(config.devOrigin);
const telegram = telegramConfig();
const services = new Services(new Store(resolve(process.env.DATA_DIR ?? 'data', 'memecoin.sqlite')), telegram ? { telegram: { transport: new GrammyTransport(telegram.token), chatId: telegram.chatId, userId: telegram.userId } } : {});
const app = await createApp({ token, port: config.port, devOrigin: config.devOrigin, logger, serveUi: false, services });
const vite = await createServer({
  root: 'apps/web', configFile: 'apps/web/vite.config.ts', configLoader: 'native',
  server: { host: '127.0.0.1', port: Number(devUrl.port || 80), strictPort: true },
  define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify(`http://127.0.0.1:${config.port}`) },
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await Promise.all([vite.close(), app.close()]);
}
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
try {
  await app.listen({ host: config.host, port: config.port });
  await vite.listen();
  services.start();
  logger.info({ origin: config.devOrigin, watcherPid: process.ppid }, 'Dashboard dev siap.');
  if (config.openBrowser) {
    try { await openDashboard(bootstrapUrl(config.devOrigin, token)); }
    catch { logger.warn('Browser gagal dibuka. Periksa browser default Windows lalu mulai ulang dev.'); }
  }
} catch {
  logger.error('Dev gagal dimulai. Pastikan port backend dan Vite tidak sedang dipakai.');
  await close();
  process.exitCode = 1;
}
