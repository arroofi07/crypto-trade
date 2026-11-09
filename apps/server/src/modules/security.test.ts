import { expect, it } from 'vitest';
import { FakeClock, evaluateSecurity } from '@memecoin/domain';
import type { SecurityEvidence } from '@memecoin/domain';
import { getMintEncoder } from '@solana-program/token';
import { Store } from '../db/store.ts';
import { MarketService } from './market.ts';
import { SecurityService } from './security.ts';
import { decodeMint } from '../adapters/solana.ts';

const evidence: SecurityEvidence = { program: 'token', initialized: true, decimals: 6, supplyRaw: '1000000', mintAuthority: false, freezeAuthority: false, extensions: [], accounts: Array.from({ length: 10 }, (_, i) => ({ address: String(i), amountRaw: '40000', role: 'HOLDER', verified: true })), source: 'fixture-verified', slot: '123' };
it('applies exact security thresholds and never excludes ambiguous large accounts', () => {
  expect(evaluateSecurity(evidence).status).toBe('PASS');
  expect(evaluateSecurity({ ...evidence, mintAuthority: true }).status).toBe('FAIL');
  expect(evaluateSecurity({ ...evidence, freezeAuthority: true }).status).toBe('FAIL');
  expect(evaluateSecurity({ ...evidence, supplyRaw: '0' }).status).toBe('FAIL');
  expect(evaluateSecurity({ ...evidence, extensions: [1, 12, 14, 999] }).status).toBe('FAIL');
  expect(evaluateSecurity({ ...evidence, extensions: [18, 19] }).status).toBe('PASS');
  expect(evaluateSecurity({ ...evidence, extensions: [18, 19] }).tradable).toBe(true);
  const unverified = evaluateSecurity({ ...evidence, accounts: [{ address: 'big', amountRaw: '600000', role: 'POOL', verified: false }] });
  expect(unverified.status).toBe('UNKNOWN');
  expect(unverified.tradable).toBe(true);
  expect(unverified.largestRatio).toBe('0.6');
  expect(evaluateSecurity({
    ...evidence,
    accounts: [{ address: 'pool', amountRaw: '600000', role: 'POOL', verified: true }, ...evidence.accounts],
  }).status).toBe('PASS');
  expect(evaluateSecurity({ ...evidence, accounts: [{ address: 'big', amountRaw: '200001', role: 'HOLDER', verified: true }] }).status).toBe('FAIL');
  expect(evaluateSecurity({ ...evidence, accounts: [{ address: 'boundary', amountRaw: '200000', role: 'HOLDER', verified: true }] }).status).toBe('PASS');
  expect(evaluateSecurity({ ...evidence, accounts: evidence.accounts.map((a) => ({ ...a, amountRaw: '50001' })) }).status).toBe('FAIL');
});
it('decodes native mint layout and rejects malformed Token-2022 TLV', () => {
  const bytes = getMintEncoder().encode({ mintAuthority: null, freezeAuthority: null, decimals: 6, supply: 1000000n, isInitialized: true });
  expect(decodeMint('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', Uint8Array.from(bytes)).supplyRaw).toBe('1000000');
  const extended = Buffer.alloc(170); extended.set(bytes); extended[165] = 1; extended.writeUInt16LE(999, 166);
  expect(decodeMint('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', extended).extensions).toEqual([999]);
  extended.writeUInt16LE(500, 168);
  expect(() => decodeMint('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', extended)).toThrow();
  expect(() => decodeMint('foreign', Uint8Array.from(bytes))).toThrow();
});
it('persists checks, caches for at most ten minutes, and turns RPC failure into UNKNOWN', async () => {
  const clock = new FakeClock('2026-10-22T00:00:00Z'); const store = new Store(':memory:', clock);
  try {
    const market = new MarketService(store); const token = market.add({ mint: 'So11111111111111111111111111111111111111112' }); let calls = 0;
    const security = new SecurityService(store, market, { inspect: async () => { if (++calls > 1) throw new Error('RPC credential must not leak'); return evidence; } });
    const changes: string[] = []; security.onChange = (check) => { changes.push(check.status); };
    await security.inspect(token); await security.inspect(token); expect(calls).toBe(1); expect(security.valid(token.id)).toBe(true);
    clock.advance(600_000); expect(security.valid(token.id)).toBe(false); await security.inspect(token);
    expect(changes).toEqual(['PASS','UNKNOWN']); expect(security.latest(token.id)?.status).toBe('UNKNOWN');
    expect(JSON.stringify(security.latest(token.id))).not.toContain('credential');
  } finally { store.close(); }
});
