import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DestinationStream } from 'pino';
import { createLogger } from './logger.ts';

export class RotatingLogs implements DestinationStream {
  readonly directory: string; readonly now: () => Date; readonly maxBytes: number;
  private day = ''; private index = 0;
  constructor(directory: string, now = () => new Date(), maxBytes = 5 * 1024 * 1024) { this.directory = resolve(directory); this.now = now; this.maxBytes = maxBytes; mkdirSync(this.directory, { recursive: true }); }
  write(message: string) {
    const date = this.now(), day = date.toISOString().slice(0, 10);
    if (this.day !== day) {
      this.day = day; this.index = 0;
      for (const name of readdirSync(this.directory)) {
        const match = /^app-(\d{4}-\d{2}-\d{2})-(\d+)\.log$/.exec(name); if (!match) continue;
        const path = join(this.directory, name); if (!lstatSync(path).isFile()) continue;
        if (Date.parse(`${match[1]}T00:00:00Z`) < Date.parse(`${day}T00:00:00Z`) - 13 * 86400_000) unlinkSync(path);
        else if (match[1] === day) this.index = Math.max(this.index, Number(match[2]));
      }
    }
    let path = join(this.directory, `app-${day}-${this.index}.log`);
    if (existsSync(path) && lstatSync(path).size + Buffer.byteLength(message) > this.maxBytes) path = join(this.directory, `app-${day}-${++this.index}.log`);
    appendFileSync(path, message, 'utf8');
  }
}
export function runtimeLogger(directory: string, level = 'info') {
  const files = new RotatingLogs(directory);
  return createLogger(level, { write(message: string) { process.stdout.write(message); try { files.write(message); } catch { process.stderr.write('Log file tidak dapat ditulis; periksa ruang disk dan izin folder.\n'); } } });
}
