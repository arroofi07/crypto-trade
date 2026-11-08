import type { JobState } from '@memecoin/contracts';
import { Store } from '../db/store.ts';
import { ProviderError } from '../adapters/http.ts';

export class Scheduler {
  private readonly store: Store;
  private jobs = new Map<string, { interval: () => number; run: () => Promise<void>; next: number; running: Promise<void> | null }>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(store: Store) { this.store = store; }
  add(name: string, interval: () => number, run: () => Promise<void>) { this.jobs.set(name, { interval, run, next: 0, running: null }); }
  start() { if (!this.timer) { this.timer = setInterval(() => { void this.tick(); }, 1000); void this.tick(); } }
  isRunning() { return this.timer !== undefined; }
  async tick() {
    const now = this.store.clock.now().getTime();
    await Promise.all([...this.jobs.entries()].map(async ([name, job]) => {
      if (job.running || now < job.next) return;
      const previous = this.store.get<JobState>('job_state', name);
      const state: JobState = { id: name, lastStartedAt: this.store.now(), lastSucceededAt: previous?.lastSucceededAt ?? null, lastErrorCode: null, checkpoint: previous?.checkpoint ?? {} };
      this.store.put('job_state', state);
      job.running = (async () => {
        try { await job.run(); state.lastSucceededAt = this.store.now(); state.checkpoint = { observedAt: state.lastSucceededAt }; }
        catch (error) { state.lastErrorCode = error instanceof ProviderError ? error.code : 'JOB_FAILED'; }
        finally { job.next = this.store.clock.now().getTime() + job.interval(); this.store.put('job_state', state); job.running = null; }
      })();
      await job.running;
    }));
  }
  async stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; await Promise.all([...this.jobs.values()].map((job) => job.running)); }
}
