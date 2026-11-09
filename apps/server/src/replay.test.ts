import { expect, it } from 'vitest';
import { positiveCloses, mint, securityEvidence } from '../../../tests/fixtures/trading.ts';
import { replay, sensitivity, recordingSchema } from './replay.ts';
import type { z } from 'zod';
function recording(): z.infer<typeof recordingSchema> {
  const start = '2026-10-22T00:00:00.000Z', time = (seconds: number) => new Date(Date.parse(start) + seconds * 1000).toISOString();
  const events: z.infer<typeof recordingSchema>['events'] = [];
  for (let seconds = 0; seconds <= 3600; seconds += 300) events.push({ kind: 'security', firstSeenAt: time(seconds), mint, evidence: securityEvidence });
  const prices = [...positiveCloses().flatMap((price) => [price, price]), '1.065','1.066','1.5'];
  prices.forEach((price, i) => {
    const spike = i * 30 >= 3600;
    events.push({ kind: 'market', firstSeenAt: time(i * 30), pairs: [{ chainId: 'solana', dexId: 'raydium', pairAddress: '11111111111111111111111111111111', baseToken: { address: mint, symbol: 'TEST' }, quoteToken: { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, priceUsd: price, liquidity: { usd: '1000000' }, volume: { h24: '1000000', m5: spike ? '800' : '150' }, txns: { m5: { buys: spike ? 90 : 20, sells: spike ? 20 : 25 } }, pairCreatedAt: Date.parse('2026-10-20T00:00:00Z') }] });
  });
  events.push({ kind: 'news', firstSeenAt: time(3630), item: { title: 'Known after signal', url: 'https://example.com/late', mint } });
  return { name: 'sample', start, evaluationStart: time(3600), end: time(3900), fxUsdIdr: '16000', events };
}
it('replays only first-known observations/news, keeps split explicit and isolates sensitivities', { timeout: 30_000 }, async () => {
  const input = recording(), runs = await sensitivity(input), baseline = runs[0]!;
  expect(baseline.report.metrics.closedCount).toBe(1); expect(baseline.report.trades[0]!.signal.newsIds).toHaveLength(0);
  expect(baseline.split.parametersFrozen).toBe(true); expect(runs).toHaveLength(7); expect(new Set(runs.map((r) => r.runId)).size).toBe(7);
  expect(runs.at(-1)!.report.metrics.closedCount).toBe(0);
  const again = await replay(input); expect(again.report.metrics).toEqual(baseline.report.metrics); expect(again.recordingHash).toBe(baseline.recordingHash);
});
