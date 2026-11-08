import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { readConfig } from './config.ts';
import { runtimeLogger } from './log-files.ts';
import { bootstrapUrl, createSessionToken, openDashboard } from './session.ts';
import { Store } from './db/store.ts';
import { Services } from './modules/services.ts';
import { GrammyTransport, telegramConfig } from './adapters/telegram.ts';

const dataDirectory = resolve(process.env.DATA_DIR ?? 'data');
const logger = runtimeLogger(join(dataDirectory, 'logs'));
try {
  const config = readConfig();
  logger.level = config.logLevel;
  if (!existsSync(fileURLToPath(new URL('../../web/dist/index.html', import.meta.url)))) {
    throw new Error('Build dashboard belum tersedia. Jalankan pnpm build terlebih dahulu.');
  }
  const token = createSessionToken();
  const telegram = telegramConfig();
  const services = new Services(new Store(join(dataDirectory, 'memecoin.sqlite')), telegram ? { telegram: { transport: new GrammyTransport(telegram.token), chatId: telegram.chatId, userId: telegram.userId } } : {});
  const app = await createApp({ token, port: config.port, logger, services });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => { process.exitCode = 1; process.exit(1); }, 10_000).unref();
    try { await app.close(); logger.info('Server berhenti.'); }
    catch { process.exitCode = 1; logger.error('Server gagal berhenti dengan bersih.'); }
    finally { clearTimeout(deadline); }
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  try { await app.listen({ host: config.host, port: config.port }); }
  catch (error) {
    await app.close();
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(`Port ${config.port} sedang dipakai. Tutup aplikasi pemilik port atau ubah PORT di .env.`, { cause: error });
    }
    throw new Error('Server gagal membuka port loopback.', { cause: error });
  }
  if (config.openBrowser) {
    try { await openDashboard(bootstrapUrl(`http://${config.host}:${config.port}`, token)); }
    catch { logger.warn('Browser gagal dibuka. Periksa browser default Windows lalu mulai ulang server.'); }
  }
  services.start();
} catch (error) {
  // Only locally generated startup messages reach this boundary.
  logger.error(error instanceof Error ? error.message : 'Startup gagal.');
  process.exitCode = 1;
}
