import { Store } from '../db/store.ts';
import { SettingsService } from './settings.ts';
import { MarketService } from './market.ts';
import { Scheduler } from '../jobs/scheduler.ts';
import type { MarketAdapter } from '../adapters/dex.ts';
import type { JobState } from '@memecoin/contracts';
import { SecurityService } from './security.ts';
import type { SecurityAdapter } from '../adapters/solana.ts';
import { NewsService } from './news.ts';
import type { RssAdapter } from '../adapters/rss.ts';
import { SignalService } from './signals.ts';
import { Events } from './events.ts';
import { RiskService } from './risk.ts';
import { PaperService } from './paper.ts';
import { TelegramService } from './telegram.ts';
import type { TelegramTransport } from '../adapters/telegram.ts';
import { PerformanceService } from './performance.ts';
import { DiscoveryService } from './discovery.ts';
import { recover } from './recovery.ts';
import { backup, retainSnapshots } from '../db/operations.ts';

export class Services {
  readonly store: Store;
  readonly settings: SettingsService;
  readonly market: MarketService;
  readonly scheduler: Scheduler;
  readonly security: SecurityService;
  readonly news: NewsService;
  readonly signals: SignalService;
  readonly events: Events;
  readonly risk: RiskService;
  readonly paper: PaperService;
  readonly telegram: TelegramService | null;
  readonly performance: PerformanceService;
  readonly discovery: DiscoveryService;
  constructor(store: Store, options: { market?: MarketAdapter; security?: SecurityAdapter; news?: RssAdapter; telegram?: { transport: TelegramTransport; chatId: string; userId: string } } = {}) {
    this.store = store; this.settings = new SettingsService(store);
    const marketAdapter = options.market ?? undefined;
    this.market = new MarketService(store, marketAdapter);
    this.security = new SecurityService(store, this.market, options.security);
    this.news = new NewsService(store, this.market, options.news);
    this.events = new Events(store);
    this.signals = new SignalService(store, this.settings, this.market, this.security, this.news, this.events);
    this.risk = new RiskService(store, this.settings, this.market, this.signals);
    this.paper = new PaperService(store, this.settings, this.risk, this.signals, this.market, this.security, this.events);
    this.market.onSnapshot = (snapshot) => { this.paper.consume(snapshot); this.events.emitter.emit('event', { id: store.id(), type: 'candidate.updated', occurredAt: store.now(), entityId: snapshot.tokenId, data: {} }); };
    this.security.onChange = (check) => { this.signals.invalidate(); this.paper.securityChanged(check.tokenId); };
    this.scheduler = new Scheduler(store);
    this.scheduler.add('market', () => this.settings.settings().pollingSeconds * 1000, () => this.market.collect());
    this.scheduler.add('security', () => 60_000, () => this.security.refresh());
    this.scheduler.add('news', () => 900_000, () => this.news.refresh());
    this.scheduler.add('signals', () => 5000, async () => { this.signals.evaluate(); });
    this.scheduler.add('paper', () => 1000, async () => { this.paper.tick(); });
    this.telegram = options.telegram ? new TelegramService(this, options.telegram.transport, options.telegram.chatId, options.telegram.userId) : null;
    this.performance = new PerformanceService(this);
    this.discovery = new DiscoveryService(store, this.market, marketAdapter ?? this.market.adapter, options.security ?? this.security.adapter);
    this.scheduler.add('discovery', () => 600_000, () => this.discovery.refresh());
    this.scheduler.add('discovery-security', () => 60_000, () => this.discovery.screen(6));
    if (this.telegram) this.scheduler.add('telegram', () => 1000, () => { this.telegram!.healthAlert(); return this.telegram!.deliver(); });
    this.scheduler.add('heartbeat', () => 30_000, async () => { store.put('job_state', { id: 'runtime', lastSeenAt: store.now(), cleanShutdown: false }); });
    if (store.path !== ':memory:') this.scheduler.add('maintenance', () => 86400_000, async () => {
      const previous = store.get<{ lastBackupAt: string }>('job_state', 'backup');
      if (!previous || store.clock.now().getTime() - Date.parse(previous.lastBackupAt) >= 86400_000) { await backup(store); store.put('job_state', { id: 'backup', lastBackupAt: store.now() }); }
      retainSnapshots(store);
    });
  }
  health() {
    const job = this.store.get<JobState>('job_state', 'market');
    const tokens = this.market.monitoredTokens();
    const fresh = tokens.every((t) => this.market.fresh(t.canonicalPoolId ? this.market.latest(t.canonicalPoolId) : undefined));
    return { application: 'ready' as const, mode: 'simulation' as const, database: 'ready' as const, providers: !tokens.length && !this.discovery.list().length ? 'idle' : !tokens.length ? 'ready' : job?.lastErrorCode ? 'unavailable' : fresh ? 'ready' : 'stale', scheduler: this.scheduler.isRunning() ? 'running' : 'stopped', lastJobAt: job?.lastSucceededAt ?? null, dataGap: this.store.list('data_gaps').length ? 'present' : 'unknown', telegram: this.telegram?.health() ?? 'disabled', jobs: this.store.list<JobState>('job_state').filter((job) => 'lastStartedAt' in job), limitations: ['DEX Screener tidak menyediakan timestamp harga sumber; freshness mengukur observasi lokal.', 'Penemuan menggabungkan feed, meta trending, dan pencarian DEX Screener; bukan seluruh chain Solana.', 'Urutan kandidat = skor aturan, bukan rekomendasi profit.'] };
  }
  start() { if (this.scheduler.isRunning()) return; recover(this); this.telegram?.start(); this.scheduler.start(); }
  async close() { this.paper.accepting = false; await this.telegram?.stop(); await this.scheduler.stop(); if (this.store.db.open) this.store.put('job_state', { id: 'runtime', lastSeenAt: this.store.now(), cleanShutdown: true }); this.store.close(); }
}
