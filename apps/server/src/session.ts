import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';

export function createSessionToken(): string { return randomBytes(32).toString('base64url'); }

export function validAuthorization(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function bootstrapUrl(origin: string, token: string): string {
  return `${origin}/#session=${encodeURIComponent(token)}`;
}

// Pass the URL in the child environment so it is absent from our command line and logs.
export async function openDashboard(url: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Peluncur browser saat ini membutuhkan Windows.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Start-Process -FilePath $env:MEMECOIN_BOOTSTRAP_URL -WindowStyle Hidden',
    ], { windowsHide: true, stdio: 'ignore', env: { ...process.env, MEMECOIN_BOOTSTRAP_URL: url } });
    child.once('error', () => reject(new Error('Browser gagal dibuka.')));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Browser gagal dibuka.')));
  });
}
