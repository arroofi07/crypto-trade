import { address, createSolanaRpcFromTransport, isSome } from '@solana/kit';
import type { RpcTransport } from '@solana/kit';
import { getMintDecoder, getTokenDecoder } from '@solana-program/token';
import type { SecurityEvidence } from '@memecoin/domain';
import { mintSchema } from '@memecoin/contracts';
import { HttpClient, ProviderError } from './http.ts';

const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
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
export interface SecurityAdapter { inspect(mint: string): Promise<SecurityEvidence> }
export class SolanaAdapter implements SecurityAdapter {
  private readonly rpc;
  constructor(http = new HttpClient({ budget: 20 })) {
    const transport: RpcTransport = async <TResponse>({ payload }: Parameters<RpcTransport>[0]) => await http.json('https://api.mainnet.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) as TResponse;
    this.rpc = createSolanaRpcFromTransport(transport);
  }
  async inspect(mint: string): Promise<SecurityEvidence> {
    mintSchema.parse(mint);
    const account = await this.rpc.getAccountInfo(address(mint), { encoding: 'base64', commitment: 'confirmed' }).send();
    if (!account.value) throw new ProviderError('MINT_UNAVAILABLE');
    const decoded = decodeMint(account.value.owner, Buffer.from(account.value.data[0], 'base64'));
    const largest = await this.rpc.getTokenLargestAccounts(address(mint), { commitment: 'confirmed' }).send();
    const accounts: SecurityEvidence['accounts'] = [];
    if (largest.value.length) {
      const details = await this.rpc.getMultipleAccounts(largest.value.map((a) => a.address), { encoding: 'base64', commitment: 'confirmed' }).send();
      for (let index = 0; index < largest.value.length; index++) {
        const item = largest.value[index]!, data = details.value[index];
        if (!data || data.owner !== account.value.owner) throw new ProviderError('ACCOUNT_MISMATCH');
        const token = getTokenDecoder().decode(Buffer.from(data.data[0], 'base64').subarray(0, 165));
        if (token.mint !== mint || token.amount.toString() !== item.amount) throw new ProviderError('ACCOUNT_MISMATCH');
        // RPC proves account/mint/amount, but not pool/burn affiliation. Never infer it from size.
        accounts.push({ address: item.address, amountRaw: item.amount, role: 'UNKNOWN', verified: false });
      }
    }
    return { ...decoded, accounts, source: 'solana-public-rpc', slot: account.context.slot.toString() };
  }
}
