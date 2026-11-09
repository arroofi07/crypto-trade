import { evaluateSecurity, securityTradable } from '@memecoin/domain';
import { securitySchema } from '@memecoin/contracts';
import type { SecurityCheck, Token } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { SolanaAdapter } from '../adapters/solana.ts';
import type { SecurityAdapter } from '../adapters/solana.ts';
import { ProviderError } from '../adapters/http.ts';
import { MarketService } from './market.ts';
import type { Pool } from '@memecoin/contracts';

export class SecurityService {
  readonly store: Store; readonly market: MarketService; readonly adapter: SecurityAdapter;
  onChange: (check: SecurityCheck) => void = () => undefined;
  constructor(store: Store, market: MarketService, adapter: SecurityAdapter = new SolanaAdapter()) { this.store = store; this.market = market; this.adapter = adapter; }
  latest(tokenId: string) { return this.store.list<SecurityCheck>('security_checks', 'token_id=?', [tokenId], 'checked_at DESC, rowid DESC LIMIT 1')[0]; }
  valid(tokenId: string) {
    const check = this.latest(tokenId);
    return !!check && Date.parse(check.expiresAt) > this.store.clock.now().getTime() && Date.parse(check.checkedAt) <= this.store.clock.now().getTime() && securityTradable(check.checks);
  }
  async inspect(token: Token, force = false) {
    const previous = this.latest(token.id);
    if (!force && previous && Date.parse(previous.expiresAt) > this.store.clock.now().getTime()) return previous;
    let check: SecurityCheck;
    try {
      const pool = token.canonicalPoolId ? this.store.get<Pool>('pools', token.canonicalPoolId) : undefined;
      const evidence = await this.adapter.inspect(token.mint, pool ? { dexId: pool.dexId, pairAddress: pool.address } : undefined);
      check = securitySchema.parse({ id: this.store.id(), tokenId: token.id, checkedAt: this.store.now(), expiresAt: new Date(this.store.clock.now().getTime() + 600_000).toISOString(), ...evaluateSecurity(evidence), evidence, decoderVersion: '@solana-program/token@0.18.0/base82+strict-tlv-v1' });
      if (evidence.decimals >= 0 && evidence.decimals <= 18 && Number.isInteger(evidence.decimals)) this.market.saveToken({ ...this.store.get<Token>('tokens', token.id)!, decimals: evidence.decimals });
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'RPC_UNAVAILABLE';
      check = securitySchema.parse({ id: this.store.id(), tokenId: token.id, checkedAt: this.store.now(), expiresAt: new Date(this.store.clock.now().getTime() + 180_000).toISOString(), status: 'UNKNOWN', checks: [{ code, status: 'UNKNOWN', text: `Bukti RPC gagal (${code}). RPC publik sering menolak/rate-limit; isi SOLANA_RPC_URL di .env jika perlu.` }], evidence: {}, decoderVersion: '@solana-program/token@0.18.0/base82+strict-tlv-v1', largestRatio: null, top10Ratio: null, limitations: ['Tidak ada kesimpulan keamanan dari data yang hilang.'] });
    }
    this.store.put('security_checks', check, { token_id: token.id, checked_at: check.checkedAt }, true);
    this.onChange(check); return check;
  }
  async refresh() { for (const token of this.market.monitoredTokens()) await this.inspect(token); }
}
