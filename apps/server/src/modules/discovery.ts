import { D, evaluateSecurity } from '@memecoin/domain';
import { discoveryCandidateSchema } from '@memecoin/contracts';
import type { DiscoveryCandidate } from '@memecoin/contracts';
import type { DexPair } from '../adapters/dex.ts';
import type { MarketAdapter } from '../adapters/dex.ts';
import { Store } from '../db/store.ts';
import { AppError } from './settings.ts';
import type { MarketService } from './market.ts';
import type { SecurityAdapter } from '../adapters/solana.ts';

const TTL_MS = 7 * 86400_000;
const MAX_CANDIDATES = 500;
const SCREEN_PER_CYCLE = 8;

export function scoreDiscoveryPair(pair: DexPair, now: number) {
  const reasons: string[] = [];
  let score = 0;
  if (new D(pair.liquidity.usd).gte('5000')) score += 35; else reasons.push('LIQUIDITY_LOW');
  if (pair.volume?.h24 && new D(pair.volume.h24).gte('5000')) score += 25; else reasons.push('VOLUME_LOW');
  if (now - pair.pairCreatedAt >= 3600_000) score += 20; else reasons.push('POOL_TOO_YOUNG');
  if (new D(pair.priceUsd).gt(0)) score += 10;
  if (['raydium', 'orca', 'meteora', 'pumpswap'].includes(pair.dexId)) score += 10;
  return { score, reasonCodes: reasons.length ? reasons : ['RULES_OK'] };
}

const emptySecurity = { securityStatus: 'PENDING' as const, securityTradable: false, securityCodes: [] as string[], securityCheckedAt: null as string | null };

export class DiscoveryService {
  readonly store: Store;
  readonly market: MarketService;
  readonly adapter: MarketAdapter;
  readonly securityAdapter: SecurityAdapter | undefined;
  constructor(store: Store, market: MarketService, adapter: MarketAdapter, securityAdapter?: SecurityAdapter) {
    this.store = store; this.market = market; this.adapter = adapter;
    this.securityAdapter = securityAdapter;
  }
  list() {
    const now = this.store.clock.now().getTime();
    return this.store.list<DiscoveryCandidate>('discovery_candidates', 'dismissed=?', [0])
      .map((row) => discoveryCandidateSchema.parse(row))
      .filter((row) => Date.parse(row.expiresAt) > now && !row.promoted)
      .sort((a, b) => Number(b.securityTradable) - Number(a.securityTradable) || b.score - a.score || b.lastSeenAt.localeCompare(a.lastSeenAt));
  }
  private save(row: DiscoveryCandidate) {
    return this.store.put('discovery_candidates', discoveryCandidateSchema.parse(row), { mint: row.mint, dismissed: row.dismissed ? 1 : 0 });
  }
  async refresh() {
    const now = this.store.clock.now().getTime();
    const cursor = this.store.get<import('../adapters/dex-discovery.ts').DiscoveryCursor & { id: string }>('job_state', 'discovery-cursor') ?? undefined;
    let scan: { pairs: Array<import('../adapters/dex.ts').RankedDiscoveryPair>; cursor: import('../adapters/dex-discovery.ts').DiscoveryCursor };
    try { scan = await this.adapter.discover(cursor); } catch { await this.screen(); return; }
    this.store.put('job_state', { id: 'discovery-cursor', ...scan.cursor });
    const pairs = scan.pairs;
    for (const pair of pairs) {
      const { score, reasonCodes } = scoreDiscoveryPair(pair, now);
      const existing = this.store.list<DiscoveryCandidate>('discovery_candidates', 'mint=?', [pair.baseToken.address])[0];
      const parsed = existing ? discoveryCandidateSchema.parse(existing) : null;
      const poolChanged = parsed && parsed.poolAddress !== pair.pairAddress;
      const row: DiscoveryCandidate = {
        id: parsed?.id ?? this.store.id(),
        mint: pair.baseToken.address,
        symbol: pair.baseToken.symbol ?? null,
        name: pair.baseToken.name ?? null,
        poolAddress: pair.pairAddress,
        dexId: pair.dexId,
        priceUsd: pair.priceUsd,
        liquidityUsd: pair.liquidity.usd,
        volume24hUsd: pair.volume?.h24 ?? null,
        score,
        reasonCodes,
        firstSeenAt: parsed?.firstSeenAt ?? this.store.now(),
        lastSeenAt: this.store.now(),
        expiresAt: new Date(now + TTL_MS).toISOString(),
        dismissed: parsed?.dismissed ?? false,
        promoted: parsed?.promoted ?? false,
        source: pair.source,
        ...(poolChanged ? emptySecurity : {
          securityStatus: parsed?.securityStatus ?? 'PENDING',
          securityTradable: parsed?.securityTradable ?? false,
          securityCodes: parsed?.securityCodes ?? [],
          securityCheckedAt: parsed?.securityCheckedAt ?? null,
        }),
      };
      this.save(row);
    }
    const ranked = this.list();
    for (const extra of ranked.slice(MAX_CANDIDATES)) this.save({ ...extra, dismissed: true });
    await this.screen();
  }
  async screen(limit = SCREEN_PER_CYCLE) {
    if (!this.securityAdapter) return;
    const now = this.store.clock.now().getTime();
    const due = this.list().filter((row) => row.securityStatus === 'PENDING' || !row.securityCheckedAt || now - Date.parse(row.securityCheckedAt) > 600_000).slice(0, limit);
    for (const row of due) await this.inspectCandidate(row);
  }
  private async inspectCandidate(row: DiscoveryCandidate) {
    if (!this.securityAdapter) return row;
    try {
      const evidence = await this.securityAdapter.inspect(row.mint, { dexId: row.dexId, pairAddress: row.poolAddress });
      const result = evaluateSecurity(evidence);
      return this.save({
        ...row,
        securityStatus: result.status,
        securityTradable: result.tradable,
        securityCodes: result.checks.filter((c) => c.status !== 'PASS').map((c) => c.code),
        securityCheckedAt: this.store.now(),
      });
    } catch {
      return this.save({ ...row, securityStatus: 'UNKNOWN', securityTradable: false, securityCodes: ['RPC_UNAVAILABLE'], securityCheckedAt: this.store.now() });
    }
  }
  async promote(mint: string) {
    const found = this.store.list<DiscoveryCandidate>('discovery_candidates', 'mint=?', [mint])[0];
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Kandidat tidak ditemukan.');
    let row = discoveryCandidateSchema.parse(found);
    if (!row.securityTradable) row = discoveryCandidateSchema.parse(await this.inspectCandidate(row));
    if (!row.securityTradable) throw new AppError(409, 'CONFLICT', `Tidak dipantau: keamanan ${row.securityStatus} (${row.securityCodes.join(', ') || 'belum lolos gate'}). Pilih kandidat yang lolos saringan.`);
    const token = this.market.add({ mint });
    this.save({ ...row, promoted: true, lastSeenAt: this.store.now() });
    return token;
  }
  dismiss(mint: string) {
    const row = this.store.list<DiscoveryCandidate>('discovery_candidates', 'mint=?', [mint])[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Kandidat tidak ditemukan.');
    return this.save({ ...discoveryCandidateSchema.parse(row), dismissed: true, lastSeenAt: this.store.now() });
  }
}
