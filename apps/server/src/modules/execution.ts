import { DisabledExecutionPort, type ExecutionPort } from '@memecoin/domain';

export function createExecutionPort(env: NodeJS.ProcessEnv = process.env): ExecutionPort {
  if (env.EXECUTION_MODE === 'manual_confirm') return new DisabledExecutionPort();
  return new DisabledExecutionPort();
}
