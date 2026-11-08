import { expect, it } from 'vitest';
import { classifyAccount } from './pool-vaults.ts';

it('mengklasifikasi burn dan pool vault yang terverifikasi', () => {
  const vaults = new Set(['Vault1111111111111111111111111111111111111']);
  expect(classifyAccount('1nc1nerator11111111111111111111111111111111', vaults).role).toBe('BURN');
  expect(classifyAccount('Vault1111111111111111111111111111111111111', vaults).role).toBe('POOL');
  expect(classifyAccount('Holder111111111111111111111111111111111111', vaults).role).toBe('HOLDER');
});
