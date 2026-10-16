import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_NAME } from '../worker/constants';

const geminiCreateInteraction = vi.fn();
const { traceCalls, flushMock } = vi.hoisted(() => ({
  traceCalls: [] as Array<{ name: string; run_type?: string; metadata?: Record<string, unknown>; input: unknown }>,
  flushMock: vi.fn(async () => {}),
}));

vi.mock('../worker/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../worker/gemini')>();
  return {
    ...actual,
    geminiCreateInteraction: (...args: unknown[]) => geminiCreateInteraction(...args),
  };
});

vi.mock('langsmith', () => {
  class AgentAddress {
    kind = 'AGENT';
    constructor(public id: string, public environment: string) {}
  }
  class Client {
    constructor(_config: { apiKey?: string }) {}
    awaitPendingTraceBatches = flushMock;
  }
  return { Client, AgentAddress };
});

vi.mock('langsmith/traceable', () => ({
  traceable: (
    fn: (input: unknown) => unknown,
    config: { name: string; run_type?: string; metadata?: Record<string, unknown> }
  ) => {
    return async (input: unknown) => {
      traceCalls.push({
        name: config.name,
        run_type: config.run_type,
        metadata: config.metadata,
        input,
      });
      return fn(input);
    };
  },
}));

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const tracingEnv = {
  API_KEY_COOKIE_SECRET: SECRET,
  LANGSMITH_TRACING: 'true',
  LANGSMITH_ENDPOINT: 'https://api.smith.langchain.com',
  LANGSMITH_API_KEY: 'lsv2_pt_test_key_123456',
  LANGSMITH_AGENT_ID: 'parle',
  LANGSMITH_AGENT_ENVIRONMENT: 'local',
} as unknown as Env;

const plainEnv = { API_KEY_COOKIE_SECRET: SECRET } as unknown as Env;

const AUDIO = 'Y3VycmVudA==';

function recordingContext(): { ctx: { waitUntil(promise: Promise<unknown>): void }; pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
    },
  };
}

async function sessionCookie(env: Env, keys: { geminiApiKey?: string; openaiApiKey?: string }): Promise<string> {
  const { handleCreateSession } = await import('../worker/routes/session');
  const response = await handleCreateSession(
    new Request('http://localhost:8787/api/session', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(keys),
    }),
    env
  );
  const setCookie = response.headers.get('Set-Cookie') ?? '';
  const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) throw new Error('missing session cookie');
  return `${COOKIE_NAME}=${match[1]}`;
}

function jsonRequest(path: string, cookie: string, body: unknown): Request {
  return new Request(`http://localhost:8787${path}`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

const rolePlayScenario = {
  id: 'scenario-bakery',
  name: 'Boulangerie',
  description: 'Acheter une baguette',
  createdAt: 1,
  isActive: true,
  characters: [{ id: 'c1', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
};

beforeEach(() => {
  traceCalls.length = 0;
  flushMock.mockReset();
  geminiCreateInteraction.mockReset();
  geminiCreateInteraction.mockResolvedValue({
    id: 'int_abc',
    outputText: JSON.stringify({ french: 'Bonjour', english: 'Hello', hint: 'Dites bonjour', conceptLabels: [] }),
  });
});

describe('role-play LangSmith traces', () => {
  it('nests a practice turn under one thread and omits the audio payload', async () => {
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie(tracingEnv, { geminiApiKey: 'AIza-test-key-123456' });
    const { ctx, pending } = recordingContext();
    const response = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: AUDIO,
        mimeType: 'audio/webm',
        scenario: rolePlayScenario,
      }),
      tracingEnv,
      ctx
    );

    expect(response.status).toBe(200);
    expect(traceCalls.map((call) => call.name)).toEqual(['rolePlayTurn', 'invokeGemini', 'parseOutput']);
    expect(traceCalls[0]?.metadata).toMatchObject({
      thread_id: 'scenario-bakery',
      feature: 'role-play',
      ls_modality: 'audio',
    });
    expect(traceCalls[1]?.run_type).toBe('llm');
    expect(traceCalls[1]?.metadata).toMatchObject({ thread_id: 'scenario-bakery', ls_provider: 'google' });
    expect(traceCalls[2]?.metadata).toMatchObject({ thread_id: 'scenario-bakery' });
    expect(JSON.stringify(traceCalls)).not.toContain(AUDIO);
    expect(pending).toHaveLength(1);
    await pending[0];
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('returns the practice response before the trace flush finishes', async () => {
    let releaseFlush: (() => void) | undefined;
    flushMock.mockImplementation(() => new Promise<void>((resolve) => {
      releaseFlush = resolve;
    }));
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie(tracingEnv, { geminiApiKey: 'AIza-test-key-123456' });
    const { ctx, pending } = recordingContext();
    const response = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: AUDIO,
        mimeType: 'audio/webm',
        scenario: rolePlayScenario,
      }),
      tracingEnv,
      ctx
    );

    expect(response.status).toBe(200);
    expect(pending).toHaveLength(1);
    expect(releaseFlush).toEqual(expect.any(Function));
    releaseFlush?.();
    await pending[0];
  });

  it('leaves free conversation and TEF sessions untraced', async () => {
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie(tracingEnv, { geminiApiKey: 'AIza-test-key-123456' });
    const { ctx, pending } = recordingContext();

    const free = await handleChat(
      jsonRequest('/api/chat', cookie, { audioBase64: AUDIO, mimeType: 'audio/webm' }),
      tracingEnv,
      ctx
    );
    expect(free.status).toBe(200);
    expect(traceCalls).toHaveLength(0);

    const tef = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: AUDIO,
        mimeType: 'audio/webm',
        scenario: { ...rolePlayScenario, id: 'tef-q', name: 'TEF Ad Questioning', isTefQuestioning: true },
      }),
      tracingEnv,
      ctx
    );
    expect(tef.status).toBe(200);
    expect(traceCalls).toHaveLength(0);

    const persuasion = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: AUDIO,
        mimeType: 'audio/webm',
        scenario: { ...rolePlayScenario, id: 'tef-ad', name: 'TEF Ad Persuasion' },
      }),
      tracingEnv,
      ctx
    );
    expect(persuasion.status).toBe(200);
    expect(traceCalls).toHaveLength(0);
    expect(pending).toHaveLength(0);
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('still completes a role-play turn when tracing credentials are absent', async () => {
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie(plainEnv, { geminiApiKey: 'AIza-test-key-123456' });
    const { ctx } = recordingContext();
    const response = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: AUDIO,
        mimeType: 'audio/webm',
        scenario: rolePlayScenario,
      }),
      plainEnv,
      ctx
    );
    expect(response.status).toBe(200);
    expect(traceCalls).toHaveLength(0);
    const body = await response.json() as { interactionId: string };
    expect(body.interactionId).toBe('int_abc');
  });

  it('groups scenario planning as format, model, and parse runs on one thread', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'A trip to the bakery.',
            characters: [{ name: 'Baker', role: 'baker' }],
            steps: ['Greet the baker', 'Order a baguette'],
          }),
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const { handleScenarioPlan } = await import('../worker/routes/ai');
    const cookie = await sessionCookie(tracingEnv, { openaiApiKey: 'sk-test-openai-key-123456' });
    const { ctx, pending } = recordingContext();
    const response = await handleScenarioPlan(
      jsonRequest('/api/scenario-plan', cookie, {
        description: 'acheter une baguette',
        threadId: 'scenario-bakery',
      }),
      tracingEnv,
      ctx
    );

    expect(response.status).toBe(200);
    expect(traceCalls.map((call) => call.name)).toEqual([
      'rolePlayPlan',
      'formatPrompt',
      'invokeOpenAI',
      'parseOutput',
    ]);
    expect(traceCalls[0]?.metadata).toMatchObject({ thread_id: 'scenario-bakery', stage: 'plan' });
    expect(traceCalls[2]?.run_type).toBe('llm');
    expect(traceCalls[2]?.metadata).toMatchObject({ ls_provider: 'openai', ls_model_name: 'gpt-5-nano' });
    expect(pending).toHaveLength(1);
    await pending[0];
    expect(flushMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('groups a role-play review with the practice thread and keeps audio out of the trace', async () => {
    geminiCreateInteraction.mockResolvedValue({
      id: 'int_review',
      outputText: JSON.stringify({
        items: [{ original: 'je cherche pour acheter', standard: 'je voudrais acheter' }],
      }),
    });
    const { handleScenarioReview } = await import('../worker/routes/ai');
    const cookie = await sessionCookie(tracingEnv, { geminiApiKey: 'AIza-test-key-123456' });
    const { ctx, pending } = recordingContext();
    const response = await handleScenarioReview(
      jsonRequest('/api/scenario-review', cookie, {
        threadId: 'scenario-bakery',
        scenarioName: 'Boulangerie',
        scenarioDescription: 'Acheter une baguette',
        turns: [
          { role: 'user', text: 'bonjour', audioBase64: AUDIO, mimeType: 'audio/webm' },
          { role: 'model', frenchText: 'Bonjour' },
        ],
      }),
      tracingEnv,
      ctx
    );

    expect(response.status).toBe(200);
    expect(traceCalls.map((call) => call.name)).toEqual([
      'rolePlayReview',
      'formatPrompt',
      'invokeGemini',
      'parseOutput',
    ]);
    expect(traceCalls.every((call) => call.metadata?.thread_id === 'scenario-bakery')).toBe(true);
    expect(JSON.stringify(traceCalls)).not.toContain(AUDIO);
    expect(pending).toHaveLength(1);
    await pending[0];
    expect(flushMock).toHaveBeenCalled();
  });
});
