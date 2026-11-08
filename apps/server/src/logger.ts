import pino from 'pino';
import type { DestinationStream } from 'pino';

export function createLogger(level = 'info', destination?: DestinationStream) {
  return pino({
    level,
    redact: {
      paths: ['token', 'sessionToken', 'bootstrapUrl', 'authorization', 'cookie', 'headers', 'req.headers', 'res.headers', '*.token', '*.sessionToken'],
      censor: '[REDACTED]',
    },
    // Never serialize raw URLs, bodies, headers, or errors containing user input.
    serializers: {
      req: (req: { method?: string }) => ({ method: req.method }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      err: () => ({ message: 'Kesalahan internal; detail sensitif tidak dicatat.' }),
    },
  }, destination);
}
