export * from './decimal.js';
export * from './security.js';
export * from './strategy.js';
export * from './risk.js';
export * from './performance.js';
export * from './execution.js';
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export class FakeClock implements Clock {
  private instant: number;

  constructor(initial: string | Date) {
    this.instant = new Date(initial).getTime();
    if (!Number.isFinite(this.instant)) throw new Error('Waktu awal tidak valid.');
  }

  now(): Date { return new Date(this.instant); }

  advance(milliseconds: number): void {
    const next = this.instant + milliseconds;
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || !Number.isFinite(new Date(next).getTime())) {
      throw new Error('Durasi clock harus positif atau nol dan berada dalam rentang Date.');
    }
    this.instant = next;
  }
}
