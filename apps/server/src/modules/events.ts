import { EventEmitter } from 'node:events';
import type { DomainEvent, OutboxEvent } from '@memecoin/contracts';
import { Store } from '../db/store.ts';

export class Events {
  readonly store: Store; readonly emitter = new EventEmitter();
  constructor(store: Store) { this.store = store; }
  append(type: string, entityId: string, data: Record<string, unknown>, portfolioId?: string) {
    const event: DomainEvent = { id: this.store.id(), type, occurredAt: this.store.now(), entityId, data, ...(portfolioId ? { portfolioId } : {}) };
    for (const channel of ['domain','telegram'] as const) {
      if (channel === 'telegram' && !['signal.created','position.updated'].includes(type)) continue;
      const record: OutboxEvent = { id: this.store.id(), eventId: event.id, channel, dedupeKey: `${event.id}:${channel}`, payload: { ...event }, state: 'PENDING', attemptCount: 0, nextAttemptAt: this.store.now(), deliveredAt: null, externalMessageId: null };
      this.store.put('outbox', record, { dedupe_key: record.dedupeKey, state: record.state, next_attempt_at: record.nextAttemptAt }, true);
    }
    return event;
  }
  flush() {
    if (this.store.db.inTransaction) return;
    for (const row of this.store.list<OutboxEvent>('outbox', "state='PENDING'")) {
      if (row.channel !== 'domain') continue;
      this.emitter.emit('event', row.payload);
      this.store.put('outbox', { ...row, state: 'DELIVERED', deliveredAt: this.store.now() }, { dedupe_key: row.dedupeKey, state: 'DELIVERED', next_attempt_at: row.nextAttemptAt });
    }
  }
}
