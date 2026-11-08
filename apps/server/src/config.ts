import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(4317),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OPEN_BROWSER: z.enum(['true', 'false']).default('true'),
  DEV_ORIGIN: z.string().default('http://127.0.0.1:5173').refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.origin === value;
    } catch { return false; }
  }),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new Error('Konfigurasi PORT, LOG_LEVEL, OPEN_BROWSER, atau DEV_ORIGIN tidak valid.');
  return {
    host: '127.0.0.1' as const,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    openBrowser: result.data.OPEN_BROWSER === 'true',
    devOrigin: result.data.DEV_ORIGIN,
  };
}
