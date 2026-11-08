import { expect, it } from 'vitest';
import { FakeClock } from './index.js';

it('advances deterministically without sharing mutable Date objects', () => {
  const clock = new FakeClock('2026-10-22T00:00:00.000Z');
  clock.now().setUTCFullYear(2000);
  clock.advance(60_000);
  expect(clock.now().toISOString()).toBe('2026-10-22T00:01:00.000Z');
  expect(() => clock.advance(-1)).toThrow();
  expect(() => clock.advance(Infinity)).toThrow();
  expect(() => new FakeClock('invalid')).toThrow();
});
