import { z } from 'zod';
import { defaultCost, FakeClock } from '@memecoin/domain';
import { mintSchema, newsInputSchema, positive, utc } from '@memecoin/contracts';
import type { SecurityEvidence } from '@memecoin/domain';
import { Store, hash } from './db/store.ts';
import { Services } from './modules/services.ts';
import { pairSchema } from './adapters/dex.ts';
import type { DexPair } from './adapters/dex.ts';
import { ProviderError } from './adapters/http.ts';

const evidence = z.object({ program: z.enum(['token','token2022','unsupported']), initialized: z.boolean(), decimals: z.number().int().min(0).max(18), supplyRaw: z.string().regex(/^\d+$/), mintAuthority: z.boolean(), freezeAuthority: z.boolean(), extensions: z.array(z.number().int()), accounts: z.array(z.object({ address: z.string(), amountRaw: z.string().regex(/^\d+$/), role: z.enum(['HOLDER','POOL','BURN','UNKNOWN']), verified: z.boolean() })), source: z.string(), slot: z.string() });
export const recordingSchema = z.object({
  name: z.string().min(1).max(100), fxUsdIdr: positive, start: utc, evaluationStart: utc, end: utc,
  events: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('market'), firstSeenAt: utc, pairs: z.array(pairSchema) }),
    z.object({ kind: z.literal('security'), firstSeenAt: utc, mint: mintSchema, evidence }),
    z.object({ kind: z.literal('news'), firstSeenAt: utc, item: newsInputSchema }),
  ])).max(500_000),
}).refine((r) => r.start < r.evaluationStart && r.evaluationStart <= r.end && r.events.every((e) => e.firstSeenAt >= r.start && e.firstSeenAt <= r.end), 'Periode train/evaluasi atau firstSeenAt tidak valid.');
export const sensitivityScenarios = [
  { name: 'baseline', slippage: '0.01', fixedFeeIdr: '500', delaySeconds: 0 },
  { name: 'slippage-2pct', slippage: '0.02', fixedFeeIdr: '500', delaySeconds: 0 },
  { name: 'slippage-5pct', slippage: '0.05', fixedFeeIdr: '500', delaySeconds: 0 },
  { name: 'fixed-fee-2x', slippage: '0.01', fixedFeeIdr: '1000', delaySeconds: 0 },
  ...[30,60,120].map((delaySeconds) => ({ name: `delay-${delaySeconds}s`, slippage: '0.01', fixedFeeIdr: '500', delaySeconds })),
] as const;
export async function replay(input: unknown, scenario: (typeof sensitivityScenarios)[number] = sensitivityScenarios[0]!) {
  const recording = recordingSchema.parse(input), clock = new FakeClock(recording.start), store = new Store(':memory:', clock);
  let pairs: DexPair[] = []; const security = new Map<string, SecurityEvidence>();
  const services = new Services(store, { market: { tokens: async (mints) => pairs.filter((p) => mints.includes(p.baseToken.address)), pairs: async (addresses) => pairs.filter((p) => addresses.includes(p.pairAddress)), discover: async () => ({ pairs: [], cursor: { metaOffset: 0, searchOffset: 0 } }) }, security: { inspect: async (mint) => { const item = security.get(mint); if (!item) throw new ProviderError('SECURITY_NOT_YET_KNOWN'); return item; } } });
  try {
    const portfolio = services.settings.create({ fxUsdIdr: recording.fxUsdIdr, activate: true }, scenario.name === 'baseline' ? undefined : { ...defaultCost, slippage: scenario.slippage, fixedFeeIdr: scenario.fixedFeeIdr }).portfolios[0]!;
    const requested = new Set<string>();
    // Only the currently delivered event enters an adapter. Future arrays are never queried by services.
    for (const event of [...recording.events].sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))) {
      clock.advance(Date.parse(event.firstSeenAt) - clock.now().getTime());
      services.paper.accepting = false; services.paper.tick(); services.paper.accepting = true;
      if (event.kind === 'security') {
        security.set(event.mint, event.evidence); const token = services.market.add({ mint: event.mint }); await services.security.inspect(token, true);
      } else if (event.kind === 'news') services.news.add(event.item);
      else {
        pairs = event.pairs;
        for (const pair of pairs) services.market.add({ mint: pair.baseToken.address });
        await services.market.collect().catch((error: unknown) => { if (!(error instanceof ProviderError)) throw error; });
        services.signals.evaluate();
      }
      if (event.firstSeenAt >= recording.evaluationStart) for (const signal of services.signals.list()) {
        if (signal.publishedAt < recording.evaluationStart || requested.has(signal.id) || Date.parse(event.firstSeenAt) < Date.parse(signal.publishedAt) + scenario.delaySeconds * 1000) continue;
        requested.add(signal.id); services.paper.request(signal.id, portfolio.id, `replay:${signal.id}`, 'auto');
      }
    }
    clock.advance(Date.parse(recording.end) - clock.now().getTime()); services.paper.accepting = false; services.paper.tick();
    const report = services.performance.report({ portfolioId: portfolio.id, from: recording.evaluationStart, to: recording.end });
    return { runId: store.id(), recordingHash: hash(recording), scenario, split: { trainOrWarmup: { from: recording.start, toExclusive: recording.evaluationStart }, evaluation: { from: recording.evaluationStart, to: recording.end }, parametersFrozen: true }, report, limitations: ['Replay rekaman tersedia, bukan seluruh universe atau backtest yang bebas survivorship bias.', 'Train hanya untuk warm-up; tidak melakukan tuning otomatis. Request delay dibulatkan ke event berikutnya; fill tetap observasi berikut request.', 'Tidak melakukan HTTP, Telegram, interpolasi harga, atau backfill selama gap. Baseline dan setiap sensitivitas memakai database in-memory terpisah.'] };
  } finally { await services.close(); }
}
export async function sensitivity(input: unknown) { const runs = []; for (const scenario of sensitivityScenarios) runs.push(await replay(input, scenario)); return runs; }
