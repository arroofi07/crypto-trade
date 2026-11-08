import { address, createSolanaRpcFromTransport } from '@solana/kit';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let encoded = '';
  while (value > 0n) { const mod = Number(value % 58n); value /= 58n; encoded = BASE58[mod]! + encoded; }
  return BASE58[0]!.repeat(zeros) + (encoded || BASE58[0]!);
}

const BURN_ADDRESSES = new Set([
  '1nc1nerator11111111111111111111111111111111',
  '11111111111111111111111111111111',
]);

const VAULT_OFFSETS: Record<string, readonly number[]> = {
  raydium: [328, 360],
  pumpswap: [139, 171],
  orca: [168, 200],
  meteora: [152, 184],
};

function readPubkey(data: Buffer, offset: number): string | null {
  if (offset + 32 > data.length) return null;
  try { return encodeBase58(data.subarray(offset, offset + 32)); } catch { return null; }
}

export function knownBurnAddresses(): readonly string[] { return [...BURN_ADDRESSES]; }

type SecurityRpc = ReturnType<typeof createSolanaRpcFromTransport>;

export async function verifiedPoolVaultAddresses(rpc: SecurityRpc, dexId: string, pairAddress: string): Promise<Set<string>> {
  const offsets = VAULT_OFFSETS[dexId];
  if (!offsets) return new Set();
  const info = await rpc.getAccountInfo(address(pairAddress), { encoding: 'base64', commitment: 'confirmed' }).send();
  if (!info.value?.data[0]) return new Set();
  const data = Buffer.from(info.value.data[0], 'base64');
  const vaults = new Set<string>();
  for (const offset of offsets) {
    const key = readPubkey(data, offset);
    if (key) vaults.add(key);
  }
  return vaults;
}

export function classifyAccount(addressKey: string, poolVaults: Set<string>): { role: 'POOL' | 'BURN' | 'HOLDER'; verified: boolean } {
  if (BURN_ADDRESSES.has(addressKey)) return { role: 'BURN', verified: true };
  if (poolVaults.has(addressKey)) return { role: 'POOL', verified: true };
  return { role: 'HOLDER', verified: true };
}
