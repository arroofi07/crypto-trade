import { expect, it } from 'vitest';
import { csvCell, drawdown, tradeMetrics } from './performance.js';
it('high win rate can lose money; breakeven remains a closed non-win', () => {
  const result = tradeMetrics(['10','10','10','-100','0'].map((pnlIdr) => ({ pnlIdr, holdSeconds: 60 })));
  expect(result).toMatchObject({ closedCount: 5, wins: 3, losses: 1, breakeven: 1, winRate: '0.6', netPnlIdr: '-70', expectancyIdr: '-14', profitFactor: '0.3', averageWinIdr: '10', averageLossIdr: '-100' });
  expect(tradeMetrics([]).profitFactor).toBe('undefined'); expect(tradeMetrics([{ pnlIdr: '1', holdSeconds: 0 }]).profitFactor).toBe('infinity');
});
it('does not bridge missing equity and neutralizes spreadsheet formulas and delimiters', () => {
  expect(drawdown([{ observedAt: '2026-01-01T00:00:00Z', equityIdr: '100' }, { observedAt: '2026-01-01T00:00:30Z', equityIdr: '90' }, { observedAt: '2026-01-01T00:01:00Z', equityIdr: null }, { observedAt: '2026-01-01T00:03:00Z', equityIdr: '50' }])).toEqual({ observedDrawdown: '0.1', drawdownUnknownDuringGap: true });
  expect(csvCell(' =HYPERLINK("evil")')).toBe('"\' =HYPERLINK(""evil"")"'); expect(csvCell('-10')).toBe('"\'-10"'); expect(csvCell('a,b')).toBe('"a,b"');
});
