import { D } from '@memecoin/domain';
import { barSchema, mintSchema, poolSchema, snapshotSchema, tokenSchema, watchInputSchema } from '@memecoin/contracts';
import type { Bar, Pool, Snapshot, Token, DataGap } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { DexAdapter } from '../adapters/dex.ts';
import type { DexPair, MarketAdapter } from '../adapters/dex.ts';
import { ProviderError } from '../adapters/http.ts';
import { AppError } from './settings.ts';

function readSnapshot(raw: Snapshot): Snapshot {
  return snapshotSchema.parse({
    ...raw,
    volumeH1Usd: raw.volumeH1Usd ?? null,
    volumeH6Usd: raw.volumeH6Usd ?? null,
    priceNative: raw.priceNative ?? null,
    priceChangeM5Pct: raw.priceChangeM5Pct ?? null,
    priceChangeH1Pct: raw.priceChangeH1Pct ?? null,
    priceChangeH6Pct: raw.priceChangeH6Pct ?? null,
    priceChangeH24Pct: raw.priceChangeH24Pct ?? null,
    txnsM5Buys: raw.txnsM5Buys ?? null,
    txnsM5Sells: raw.txnsM5Sells ?? null,
    txnsH1Buys: raw.txnsH1Buys ?? null,
    txnsH1Sells: raw.txnsH1Sells ?? null,
    txnsH6Buys: raw.txnsH6Buys ?? null,
    txnsH6Sells: raw.txnsH6Sells ?? null,
    txnsH24Buys: raw.txnsH24Buys ?? null,
    txnsH24Sells: raw.txnsH24Sells ?? null,
    fdvUsd: raw.fdvUsd ?? null,
    marketCapUsd: raw.marketCapUsd ?? null,
    liquidityBase: raw.liquidityBase ?? null,
    liquidityQuote: raw.liquidityQuote ?? null,
    dexPairUrl: raw.dexPairUrl ?? null,
  });
}

export class MarketService {
  readonly store: Store;
  readonly adapter: MarketAdapter;
  onSnapshot: (snapshot: Snapshot) => void = () => undefined;
  constructor(store: Store, adapter: MarketAdapter = new DexAdapter()) { this.store = store; this.adapter = adapter; }
  tokens() { return this.store.list<Token>('tokens').map((t) => tokenSchema.parse(t)); }
  token(mint: string) { mintSchema.parse(mint); const token = this.tokens().find((t) => t.mint === mint); if (!token) throw new AppError(404, 'NOT_FOUND', 'Token tidak ditemukan.'); return token; }
  saveToken(token: Token) { return this.store.put('tokens', tokenSchema.parse(token), { mint: token.mint }); }
  add(input: unknown) {
    const { mint } = watchInputSchema.parse(input);
    return this.store.transaction(() => {
      const old = this.tokens().find((t) => t.mint === mint);
      if (!old?.watchlistEnabled && this.tokens().filter((t) => t.watchlistEnabled).length >= 20) throw new AppError(409, 'CONFLICT', 'Watchlist maksimal 20 mint.');
      return this.saveToken(old ? { ...old, watchlistEnabled: true } : { id: this.store.id(), mint, chain: 'solana', name: null, symbol: null, decimals: null, watchlistEnabled: true, canonicalPoolId: null, poolSelectedAt: null, warmupSince: this.store.now(), candidateState: 'WATCH', reasonCodes: ['WARMUP_REQUIRED'] });
    });
  }
  remove(mint: string) { const token = this.token(mint); return this.saveToken({ ...token, watchlistEnabled: false }); }
  latest(poolId: string): Snapshot | undefined {
    const raw = this.store.list<Snapshot>('market_snapshots', 'pool_id=?', [poolId], 'observed_at DESC LIMIT 1')[0];
    return raw ? readSnapshot(raw) : undefined;
  }
  fresh(snapshot: Snapshot | undefined) { if (!snapshot) return false; const now = this.store.clock.now().getTime(); return [snapshot.observedAt, snapshot.sourceAt ?? snapshot.observedAt].every((time) => now >= Date.parse(time) && now - Date.parse(time) <= 90_000); }
  pinnedPools() { return new Set([...this.store.list<{ poolId: string }>('positions', "state IN ('OPEN','UNPRICED')"), ...this.store.list<{ poolId: string }>('signals', "state='VALID'")].map((p) => p.poolId)); }
  monitoredTokens() {
    const pinned = this.pinnedPools();
    const poolTokens = new Set(this.store.list<Pool>('pools').filter((p) => pinned.has(p.id)).map((p) => p.tokenId));
    return this.tokens().filter((t) => t.watchlistEnabled || poolTokens.has(t.id)).sort((a, b) => Number(poolTokens.has(b.id)) - Number(poolTokens.has(a.id)) || a.mint.localeCompare(b.mint));
  }
  async collect() {
    const tokens = this.monitoredTokens(); if (!tokens.length) return;
    const all: DexPair[] = [];
    // Locked episode pools are fetched first, even after watchlist removal.
    const locked = this.store.list<Pool>('pools').filter((p) => this.pinnedPools().has(p.id));
    for (let i = 0; i < locked.length; i += 30) all.push(...await this.adapter.pairs(locked.slice(i, i + 30).map((p) => p.address)));
    for (let i = 0; i < tokens.length; i += 30) all.push(...await this.adapter.tokens(tokens.slice(i, i + 30).map((t) => t.mint)));
    const now = this.store.clock.now().getTime(); let missing = false;
    for (let token of tokens) {
      const pairs = all.filter((p) => p.baseToken.address === token.mint && p.pairCreatedAt <= now).sort((a, b) => new D(b.liquidity.usd).cmp(a.liquidity.usd) || a.pairAddress.localeCompare(b.pairAddress));
      const current = token.canonicalPoolId ? this.store.get<Pool>('pools', token.canonicalPoolId) : undefined;
      const maySwitch = !token.poolSelectedAt || now - Date.parse(token.poolSelectedAt) >= 600_000;
      const selected = maySwitch ? pairs[0] : pairs.find((p) => p.pairAddress === current?.address);
      if (selected) {
        const pool = this.ensurePool(token, selected);
        if (pool.id !== token.canonicalPoolId) token = this.saveToken({ ...token, canonicalPoolId: pool.id, poolSelectedAt: this.store.now(), warmupSince: this.store.now(), candidateState: 'WARMING_UP', reasonCodes: ['POOL_CHANGED','WARMUP_REQUIRED'] });
        else if (maySwitch) token = this.saveToken({ ...token, poolSelectedAt: this.store.now() });
      } else missing = true;
      const wanted = new Set([token.canonicalPoolId, ...locked.filter((p) => p.tokenId === token.id).map((p) => p.id)]);
      for (const poolId of wanted) {
        if (!poolId) continue;
        const pool = this.store.get<Pool>('pools', poolId)!;
        const pair = pairs.find((p) => p.pairAddress === pool.address);
        if (pair) this.ingest(token, pool, pair); else missing = true;
      }
    }
    this.closeBars();
    if (missing) throw new ProviderError('POOL_UNAVAILABLE');
  }
  ensurePool(token: Token, pair: DexPair) {
    const old = this.store.list<Pool>('pools', 'address=?', [pair.pairAddress])[0];
    if (old && old.tokenId !== token.id) throw new ProviderError('POOL_MINT_MISMATCH');
    return old ?? this.store.put('pools', poolSchema.parse({ id: this.store.id(), tokenId: token.id, address: pair.pairAddress, provider: 'dexscreener', dexId: pair.dexId, quoteMint: pair.quoteToken.address, createdAtSource: new Date(pair.pairCreatedAt).toISOString() }), { token_id: token.id, address: pair.pairAddress }, true);
  }
  ingest(token: Token, pool: Pool, pair: DexPair) {
    if (pair.baseToken.address !== token.mint || pair.pairAddress !== pool.address) throw new ProviderError('POOL_MINT_MISMATCH');
    const observedAt = this.store.now();
    if (this.store.list<Snapshot>('market_snapshots', 'pool_id=? AND observed_at=?', [pool.id, observedAt]).length) return;
    const previous = this.latest(pool.id);
    const gap = previous !== undefined && Date.parse(observedAt) - Date.parse(previous.observedAt) > 90_000;
    const snapshot = snapshotSchema.parse({
      id: this.store.id(), tokenId: token.id, poolId: pool.id, observedAt, sourceAt: null, priceUsd: pair.priceUsd, liquidityUsd: pair.liquidity.usd,
      volume24hUsd: pair.volume?.h24 ?? null, rollingVolume5mUsd: pair.volume?.m5 ?? null, volumeH1Usd: pair.volume?.h1 ?? null, volumeH6Usd: pair.volume?.h6 ?? null,
      priceNative: pair.priceNative ?? null,
      priceChangeM5Pct: pair.priceChange?.m5 ?? null, priceChangeH1Pct: pair.priceChange?.h1 ?? null, priceChangeH6Pct: pair.priceChange?.h6 ?? null, priceChangeH24Pct: pair.priceChange?.h24 ?? null,
      txnsM5Buys: pair.txns?.m5?.buys ?? null, txnsM5Sells: pair.txns?.m5?.sells ?? null,
      txnsH1Buys: pair.txns?.h1?.buys ?? null, txnsH1Sells: pair.txns?.h1?.sells ?? null,
      txnsH6Buys: pair.txns?.h6?.buys ?? null, txnsH6Sells: pair.txns?.h6?.sells ?? null,
      txnsH24Buys: pair.txns?.h24?.buys ?? null, txnsH24Sells: pair.txns?.h24?.sells ?? null,
      fdvUsd: pair.fdv ?? null, marketCapUsd: pair.marketCap ?? null,
      liquidityBase: pair.liquidity.base ?? null, liquidityQuote: pair.liquidity.quote ?? null,
      dexPairUrl: pair.url ?? null,
      source: 'dexscreener', quality: 'sampled', sourceTimestampAvailable: false,
    });
    this.store.transaction(() => {
      this.store.put('market_snapshots', snapshot, { pool_id: pool.id, observed_at: observedAt }, true);
      if (gap) {
        const value: DataGap = { id: this.store.id(), scope: pool.id, startedAt: previous.observedAt, endedAt: observedAt, reason: 'OBSERVATION_GAP' };
        this.store.put('data_gaps', value);
      }
      const latestToken = this.store.get<Token>('tokens', token.id)!;
      this.saveToken({ ...latestToken, name: pair.baseToken.name ?? latestToken.name, symbol: pair.baseToken.symbol ?? latestToken.symbol, ...(gap && token.canonicalPoolId === pool.id ? { warmupSince: observedAt, candidateState: 'WARMING_UP' as const, reasonCodes: ['DATA_GAP'] } : {}) });
      const openAt = new Date(Math.floor(Date.parse(observedAt) / 60_000) * 60_000).toISOString();
      const old = this.store.list<Bar>('sample_bars', 'pool_id=? AND open_at=?', [pool.id, openAt])[0];
      const bar = barSchema.parse(old ? { ...old, high: D.max(old.high, pair.priceUsd).toFixed(), low: D.min(old.low, pair.priceUsd).toFixed(), close: pair.priceUsd, sampleCount: old.sampleCount + 1, lastObservedAt: observedAt, gap: old.gap || gap } : { id: this.store.id(), poolId: pool.id, openAt, closeAt: new Date(Date.parse(openAt) + 60_000).toISOString(), firstObservedAt: observedAt, lastObservedAt: observedAt, sampleCount: 1, open: pair.priceUsd, high: pair.priceUsd, low: pair.priceUsd, close: pair.priceUsd, complete: false, sampling: 'sampled', gap });
      this.store.put('sample_bars', bar, { pool_id: pool.id, open_at: openAt, close_at: bar.closeAt });
    });
    this.closeBars(); this.onSnapshot(snapshot);
  }
  closeBars() {
    for (const bar of this.store.list<Bar>('sample_bars', 'close_at<=?', [this.store.now()])) {
      const complete = bar.sampleCount >= 2 && !bar.gap;
      if (bar.complete !== complete) this.store.put('sample_bars', { ...bar, complete }, { pool_id: bar.poolId, open_at: bar.openAt, close_at: bar.closeAt });
    }
  }
  series(mint: string) {
    const token = this.token(mint); this.closeBars();
    const bars = token.canonicalPoolId ? this.store.list<Bar>('sample_bars', 'pool_id=?', [token.canonicalPoolId], 'open_at DESC LIMIT 1440').reverse() : [];
    return { bars, sampling: 'sampled', gaps: this.store.list<DataGap>('data_gaps').filter((g) => g.scope === token.canonicalPoolId) };
  }
  private txnLeader(buys: number, sells: number) { return buys > sells ? 'BUY' as const : sells > buys ? 'SELL' as const : 'TIE' as const; }
  txnSeries(mint: string) {
    const token = this.token(mint);
    const limitations = ['Hitungan buy/sell = agregat DEX Screener (bukan daftar wallet).', 'm5/h1 adalah jendela rolling provider, bukan transaksi per detik.', 'Diagram batang mengikuti interval polling market (~30 detik), bukan WebSocket on-chain.'];
    if (!token.canonicalPoolId) return { points: [], latest: null, limitations };
    const snaps = this.store.list<Snapshot>('market_snapshots', 'pool_id=?', [token.canonicalPoolId], 'observed_at DESC LIMIT 480').reverse().map(readSnapshot);
    const points = snaps.flatMap((s) => (s.txnsM5Buys != null && s.txnsM5Sells != null
      ? [{ observedAt: s.observedAt, buysM5: s.txnsM5Buys, sellsM5: s.txnsM5Sells, ...(s.txnsH1Buys != null && s.txnsH1Sells != null ? { buysH1: s.txnsH1Buys, sellsH1: s.txnsH1Sells } : {}) }]
      : []));
    const last = points.at(-1);
    const latest = last
      ? {
        observedAt: last.observedAt, buysM5: last.buysM5, sellsM5: last.sellsM5,
        buysH1: last.buysH1 ?? null, sellsH1: last.sellsH1 ?? null,
        leaderM5: this.txnLeader(last.buysM5, last.sellsM5),
        leaderH1: last.buysH1 != null && last.sellsH1 != null ? this.txnLeader(last.buysH1, last.sellsH1) : null,
      }
      : null;
    return { points, latest, limitations };
  }
  detail(mint: string) {
    const token = this.token(mint);
    const snapshot = token.canonicalPoolId ? this.latest(token.canonicalPoolId) : undefined;
    return {
      ...token, pool: token.canonicalPoolId ? this.store.get<Pool>('pools', token.canonicalPoolId) : null, snapshot: snapshot ?? null, stale: !this.fresh(snapshot),
      limitations: ['Observasi lokal ~30 detik; timestamp harga sumber dari DEX Screener tidak tersedia.', 'Volume dan txn adalah jendela rolling provider, bukan candle OHLC.', 'Field kosong berarti provider tidak mengirim atau snapshot sebelum migrasi field.'],
    };
  }
}
