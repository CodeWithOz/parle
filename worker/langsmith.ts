import { AgentAddress, Client, type Environment } from 'langsmith';
import { traceable } from 'langsmith/traceable';

/** Name assigned in App.tsx when a TEF Ad Persuasion session builds its synthetic scenario. */
export const TEF_AD_PERSUASION_SCENARIO_NAME = 'TEF Ad Persuasion';

const ENVIRONMENTS = new Set<Environment>(['local', 'development', 'staging', 'production']);
const ROLE_PLAY_TAG = 'role-play';
const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{8,}|lsv2_[A-Za-z0-9_]{8,})/g;

export type LangSmithBindings = {
  LANGSMITH_TRACING?: string;
  LANGSMITH_ENDPOINT?: string;
  LANGSMITH_API_KEY?: string;
  LANGSMITH_AGENT_ID?: string;
  LANGSMITH_AGENT_ENVIRONMENT?: string;
};

export type RolePlaySpanConfig = {
  name: string;
  runType?: 'chain' | 'llm' | 'parser' | 'tool';
  metadata?: Record<string, unknown>;
};

export type RolePlaySpan = <Input extends Record<string, unknown>, Output>(
  config: RolePlaySpanConfig,
  input: Input,
  fn: (input: Input) => Promise<Output>
) => Promise<Output>;

type RolePlayTraceConfig = RolePlaySpanConfig & {
  threadId?: string;
  inputs?: Record<string, unknown>;
};

/** Worker `ExecutionContext` surface used to finish trace uploads after the response. */
export interface TraceExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export function isRolePlayScenario(
  scenario: { name?: string; isTefQuestioning?: boolean } | null | undefined
): scenario is { name?: string; isTefQuestioning?: boolean; id: string } {
  if (!scenario || typeof scenario !== 'object') return false;
  if (scenario.isTefQuestioning) return false;
  if (scenario.name === TEF_AD_PERSUASION_SCENARIO_NAME) return false;
  return typeof (scenario as { id?: unknown }).id === 'string';
}

export function readThreadId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  return trimmed;
}

export const passthroughSpan: RolePlaySpan = async (_config, input, fn) => fn(input);

function readBindings(env: object): LangSmithBindings {
  const record = env as LangSmithBindings;
  return {
    LANGSMITH_TRACING: record.LANGSMITH_TRACING,
    LANGSMITH_ENDPOINT: record.LANGSMITH_ENDPOINT,
    LANGSMITH_API_KEY: record.LANGSMITH_API_KEY,
    LANGSMITH_AGENT_ID: record.LANGSMITH_AGENT_ID,
    LANGSMITH_AGENT_ENVIRONMENT: record.LANGSMITH_AGENT_ENVIRONMENT,
  };
}

function isEnvironment(value: string): value is Environment {
  return ENVIRONMENTS.has(value as Environment);
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_PATTERN, '[redacted]');
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = redactValue(nested);
    }
    return redacted;
  }
  return value;
}

function createClient(bindings: LangSmithBindings): Client | null {
  if (bindings.LANGSMITH_TRACING !== 'true') return null;
  if (!bindings.LANGSMITH_API_KEY || !bindings.LANGSMITH_AGENT_ID || !bindings.LANGSMITH_AGENT_ENVIRONMENT) {
    return null;
  }
  if (!isEnvironment(bindings.LANGSMITH_AGENT_ENVIRONMENT)) return null;
  try {
    return new Client({
      apiKey: bindings.LANGSMITH_API_KEY,
      apiUrl: bindings.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com',
      timeout_ms: 4_000,
      anonymizer: (values) => redactValue(values) as typeof values,
    });
  } catch (err) {
    console.error('LangSmith client setup failed', err instanceof Error ? err.name : 'Error');
    return null;
  }
}

/**
 * Groups a role-play pipeline as one LangSmith trace: the parent run and every
 * `span` call become nested child runs. Trace uploads are scheduled with
 * `ctx.waitUntil` so they finish after the response. Missing or incomplete
 * credentials run the same function with no tracing.
 */
export async function withRolePlayTrace<T>(
  env: object,
  ctx: TraceExecutionContext,
  config: RolePlayTraceConfig,
  fn: (span: RolePlaySpan) => Promise<T>
): Promise<T> {
  const bindings = readBindings(env);
  const client = createClient(bindings);
  if (!client || !bindings.LANGSMITH_AGENT_ID || !bindings.LANGSMITH_AGENT_ENVIRONMENT) {
    return fn(passthroughSpan);
  }
  if (!isEnvironment(bindings.LANGSMITH_AGENT_ENVIRONMENT)) {
    return fn(passthroughSpan);
  }

  let address: AgentAddress;
  try {
    address = new AgentAddress(bindings.LANGSMITH_AGENT_ID, bindings.LANGSMITH_AGENT_ENVIRONMENT);
  } catch (err) {
    console.error('LangSmith address setup failed', err instanceof Error ? err.name : 'Error');
    return fn(passthroughSpan);
  }

  const metadata: Record<string, unknown> = {
    feature: 'role-play',
    ...(config.threadId ? { thread_id: config.threadId } : {}),
    ...(config.metadata ?? {}),
  };

  const span: RolePlaySpan = (child, input, childFn) => {
    // A concrete wrapper keeps traceable's return type callable. Passing the
    // generic span callback directly collapses that type to {}.
    const traced = traceable(
      async (value: Record<string, unknown>) => childFn(value as never),
      {
        name: child.name,
        run_type: child.runType ?? 'chain',
        client,
        address,
        tracingEnabled: true,
        tags: [ROLE_PLAY_TAG],
        metadata: { ...metadata, ...(child.metadata ?? {}) },
      }
    );
    return traced(input);
  };

  const parent = traceable(
    async (inputs: Record<string, unknown>) => {
      void inputs;
      return fn(span);
    },
    {
      name: config.name,
      run_type: config.runType ?? 'chain',
      client,
      address,
      tracingEnabled: true,
      tags: [ROLE_PLAY_TAG],
      metadata,
    }
  );

  try {
    return await parent(config.inputs ?? { name: config.name });
  } finally {
    ctx.waitUntil(client.awaitPendingTraceBatches().catch((err: unknown) => {
      console.error('LangSmith flush failed', err instanceof Error ? err.name : 'Error');
    }));
  }
}
