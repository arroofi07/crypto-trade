import type { DataGap, OutboxEvent, Position } from '@memecoin/contracts';
import type { Services } from './services.ts';

export function recover(services: Services) {
  const { store, paper, market } = services;
  store.transaction(() => {
    const runtime = store.get<{ lastSeenAt: string }>('job_state', 'runtime');
    const previous = runtime?.lastSeenAt ?? store.list<{ observedAt: string }>('market_snapshots', '1=1', [], 'observed_at DESC LIMIT 1')[0]?.observedAt;
    if (previous && Date.parse(store.now()) - Date.parse(previous) > 90_000) {
      const gap: DataGap = { id: store.id(), scope: 'runtime', startedAt: previous, endedAt: store.now(), reason: 'OFFLINE_RESTART' }; store.put('data_gaps', gap);
      for (const token of market.tokens()) market.saveToken({ ...token, warmupSince: store.now(), candidateState: 'WARMING_UP', reasonCodes: ['DATA_GAP','WARMUP_REQUIRED'] });
    }
    // Pending intent is never executed against a historical observation during recovery.
    paper.expire();
    for (const p of store.list<Position>('positions', "state IN ('OPEN','UNPRICED')")) paper.savePosition({ ...p, state: 'UNPRICED', qualityFlags: [...new Set([...p.qualityFlags,'DATA_GAP','RECOVERY'])] });
    for (const row of store.list<OutboxEvent>('outbox', "state='SENDING'")) if (row.channel === 'telegram') store.put('outbox', { ...row, state: 'DELIVERY_UNKNOWN' }, { state: 'DELIVERY_UNKNOWN', dedupe_key: row.dedupeKey, next_attempt_at: row.nextAttemptAt });
    services.signals.invalidate();
    paper.recordEquity(); store.put('job_state', { id: 'runtime', lastSeenAt: store.now(), cleanShutdown: false });
  });
  services.events.flush();
}
