export type ExecutionMode = 'disabled' | 'manual_confirm';

export interface ExecutionQuote {
  mint: string;
  side: 'BUY' | 'SELL';
  quantityRaw: string;
  observedPriceUsd: string;
  slippageBps: number;
  note: string;
}

export interface ExecutionPort {
  mode(): ExecutionMode;
  quote(input: { mint: string; side: 'BUY' | 'SELL'; quantityRaw: string }): Promise<ExecutionQuote | null>;
}

export class DisabledExecutionPort implements ExecutionPort {
  mode() { return 'disabled' as const; }
  async quote() { return null; }
}
