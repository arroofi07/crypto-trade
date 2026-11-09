import { address, createSolanaRpcFromTransport, isSome } from '@solana/kit';
import type { RpcTransport } from '@solana/kit';
import { getMintDecoder, getTokenDecoder } from '@solana-program/token';
import type { SecurityEvidence } from '@memecoin/domain';
import { mintSchema } from '@memecoin/contracts';
import { HttpClient, ProviderError } from './http.ts';
import { classifyAccount, verifiedPoolVaultAddresses } from './pool-vaults.ts';

const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

export function rpcUrl(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.SOLANA_RPC_URL?.trim();
  if (!raw) return DEFAULT_RPC;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new Error('rpc');
    return url.toString();
  } catch { return DEFAULT_RPC; }
}

export function decodeMint(owner: string, bytes: Uint8Array) {
  if (![TOKEN, TOKEN2022].includes(owner) || bytes.length < 82) throw new ProviderError('UNSUPPORTED_PROGRAM');
  const base = getMintDecoder().decode(bytes.slice(0, 82));
  const extensions: number[] = [];
  if (owner === TOKEN && bytes.length !== 82) throw new ProviderError('INVALID_MINT');
  if (owner === TOKEN2022 && bytes.length > 82) {
    if (bytes.length < 166 || bytes[165] !== 1) throw new ProviderError('INVALID_EXTENSION');
    const buffer = Buffer.from(bytes);
    for (let offset = 166; offset < buffer.length;) {
      if (buffer.subarray(offset).every((b) => b === 0)) break;
      if (offset + 4 > buffer.length) throw new ProviderError('INVALID_EXTENSION');
      const kind = buffer.readUInt16LE(offset), size = buffer.readUInt16LE(offset + 2);
      if (!kind || offset + 4 + size > buffer.length || extensions.includes(kind)) throw new ProviderError('INVALID_EXTENSION');
      extensions.push(kind); offset += 4 + size;
    }
  }
  return { program: owner === TOKEN ? 'token' as const : 'token2022' as const, initialized: base.isInitialized, decimals: base.decimals, supplyRaw: base.supply.toString(), mintAuthority: isSome(base.mintAuthority), freezeAuthority: isSome(base.freezeAuthority), extensions };
}

export interface SecurityContext { dexId: string; pairAddress: string }
export interface SecurityAdapter { inspect(mint: string, context?: SecurityContext): Promise<SecurityEvidence> }

export class SolanaAdapter implements SecurityAdapter {
  private readonly rpc;
  private readonly url;
  constructor(http = new HttpClient({ budget: 180, timeoutMs: 20_000, retry429: false }), url = rpcUrl()) {
    this.url = url;
    const transport: RpcTransport = async <TResponse>({ payload }: Parameters<RpcTransport>[0]) => {
      const body = await http.json(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (body && typeof body === 'object' && 'error' in body && (body as { error?: unknown }).error) throw new ProviderError('RPC_ERROR');
      return body as TResponse;
    };
    this.rpc = createSolanaRpcFromTransport(transport);
  }
  async inspect(mint: string, context?: SecurityContext): Promise<SecurityEvidence> {
    mintSchema.parse(mint);
    const account = await this.rpc.getAccountInfo(address(mint), { encoding: 'base64', commitment: 'confirmed' }).send();
    if (!account.value) throw new ProviderError('MINT_UNAVAILABLE');
    const decoded = decodeMint(account.value.owner, Buffer.from(account.value.data[0], 'base64'));
    let vaults = new Set<string>();
    try { if (context) vaults = await verifiedPoolVaultAddresses(this.rpc, context.dexId, context.pairAddress); } catch { vaults = new Set(); }
    const classified = vaults.size > 0;
    const accounts: SecurityEvidence['accounts'] = [];
    try {
      const largest = await this.rpc.getTokenLargestAccounts(address(mint), { commitment: 'confirmed' }).send();
      if (largest.value.length) {
        const details = await this.rpc.getMultipleAccounts(largest.value.map((a) => a.address), { encoding: 'base64', commitment: 'confirmed' }).send();
        for (let index = 0; index < largest.value.length; index++) {
          const item = largest.value[index]!, data = details.value[index];
          if (!data || data.owner !== account.value.owner) continue;
          const token = getTokenDecoder().decode(Buffer.from(data.data[0], 'base64').subarray(0, 165));
          if (String(token.mint) !== mint) continue;
          const role = classified ? classifyAccount(item.address, vaults) : { role: 'UNKNOWN' as const, verified: false };
          accounts.push({ address: item.address, amountRaw: item.amount, role: role.role, verified: role.verified });
        }
        if (!accounts.length) for (const item of largest.value) accounts.push({ address: item.address, amountRaw: item.amount, role: 'UNKNOWN', verified: false });
      }
    } catch { /* konsentrasi opsional; mint tetap dievaluasi */ }
    return { ...decoded, accounts, source: classified ? 'solana-rpc+pool-vaults' : 'solana-public-rpc', slot: account.context.slot.toString() };
  }
}
