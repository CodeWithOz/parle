import { VoiceResponse, Scenario } from '../types';
import { isAbortLikeError } from '../utils/isAbortLikeError';
import { bffFetch } from './bffClient';

let activeScenario: Scenario | null = null;

const BROWSER_OPENAI_DISABLED =
  'OpenAI audio helpers are not available in the browser. Use the Gemini practice flow.';

export const setScenarioOpenAI = (scenario: Scenario | null) => {
  activeScenario = scenario;
};

export const processScenarioDescriptionOpenAI = async (
  description: string,
  signal?: AbortSignal
): Promise<string> => {
  try {
    const payload = await bffFetch<{ result: string }>('/api/scenario-plan', {
      method: 'POST',
      body: JSON.stringify({ description }),
      signal,
    });
    return payload.result;
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error;
    }
    console.warn('Failed to process scenario with OpenAI:', error);
    return JSON.stringify({
      summary: 'I understand the scenario. Ready to begin when you are!',
      characters: [],
      steps: [],
    });
  }
};

export const transcribeAudioOpenAI = async (
  _audioBase64: string,
  _mimeType: string
): Promise<string> => {
  throw new Error(BROWSER_OPENAI_DISABLED);
};

export const transcribeAndCleanupAudioOpenAI = async (
  _audioBase64: string,
  _mimeType: string
): Promise<{ rawTranscript: string; cleanedTranscript: string }> => {
  throw new Error(BROWSER_OPENAI_DISABLED);
};

export const sendVoiceMessageOpenAI = async (
  _audioBase64: string,
  _mimeType: string
): Promise<VoiceResponse> => {
  void activeScenario;
  throw new Error(BROWSER_OPENAI_DISABLED);
};
