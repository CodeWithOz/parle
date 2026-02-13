import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { base64ToBlob } from "./audioUtils";
import { VoiceResponse, Scenario } from "../types";
import { getConversationHistory, addToHistory } from "./conversationHistory";
import { generateScenarioSystemInstruction, generateScenarioSummaryPrompt, parseHintFromResponse } from "./scenarioService";
import { getApiKeyOrEnv } from "./apiKeyService";

// Zod schema for scenario extraction
const CharacterSchema = z.object({
  name: z.string().describe("Character name (e.g., Baker, Waiter, Manager)"),
  role: z.string().describe("Brief role description (e.g., baker, waiter, hotel receptionist)"),
});

const ScenarioSummarySchema = z.object({
  summary: z.string().describe("Brief 2-3 sentence summary of the scenario"),
  characters: z.array(CharacterSchema).min(1).max(5).describe("All distinct characters/people the user will interact with in this scenario (1-5 characters)")
});

const SYSTEM_INSTRUCTION = `
You are a friendly and patient French language tutor. 
Your goal is to help the user practice speaking French.

RULES:
1. Understand what the user says, but don't repeat it verbatim. Briefly acknowledge understanding when needed, but focus on responding naturally without restating everything the user said.
2. If the user makes a mistake, gently correct them in your response, but keep the conversation flowing naturally.
3. For EVERY response, you MUST follow this structure:
   - First, respond naturally in FRENCH.
   - Then, immediately provide the ENGLISH translation of what you just said.
   - Do not say "Here is the translation" or explain the format. Just French content, then English content.

Example interaction:
User: "Bonjour, je suis fatigue." (User means "I am tired" but mispronounced)
You: "Bonjour! Oh, tu es fatigué ? Pourquoi es-tu fatigué aujourd'hui ? ... Hello! Oh, you are tired? Why are you tired today?"
`;

// Track the active scenario for scenario-aware prompting
let activeScenario: Scenario | null = null;

/**
 * Determines the appropriate file extension based on mimeType
 */
const getAudioExtension = (mimeType: string): string => {
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes('webm')) return 'webm';
  if (lowerMime.includes('mp4') || lowerMime.includes('m4a') || lowerMime.includes('aac')) return 'm4a';
  if (lowerMime.includes('ogg')) return 'ogg';
  if (lowerMime.includes('mp3')) return 'mp3';
  return 'wav'; // Default
};

/**
 * Sets the active scenario for OpenAI service.
 */
export const setScenarioOpenAI = (scenario: Scenario | null) => {
  activeScenario = scenario;
};

/**
 * Gets AI's understanding/summary of a scenario description using OpenAI with structured output.
 */
export const processScenarioDescriptionOpenAI = async (description: string): Promise<string> => {
  const apiKey = getApiKeyOrEnv('openai');

  if (!apiKey) {
    throw new Error("Missing OpenAI API Key");
  }

  try {
    // Use Langchain ChatOpenAI with structured output
    const model = new ChatOpenAI({
      apiKey,
      model: "gpt-5-nano",
      temperature: 0.7
    });

    const structuredModel = model.withStructuredOutput(ScenarioSummarySchema, {
      name: "scenario_summary"
    });

    const result = await structuredModel.invoke(generateScenarioSummaryPrompt(description));

    // Result is already validated by Zod through Langchain
    return JSON.stringify(result);
  } catch (error) {
    console.warn('Failed to process scenario with OpenAI:', error);
    // Fallback response
    return JSON.stringify({
      summary: "I understand the scenario. Ready to begin when you are!",
      characters: []
    });
  }
};

/**
 * Transcribes audio to text using OpenAI.
 */
export const transcribeAudioOpenAI = async (audioBase64: string, mimeType: string): Promise<string> => {
  const apiKey = getApiKeyOrEnv('openai');

  if (!apiKey) {
    throw new Error("Missing OpenAI API Key");
  }

  const audioBlob = base64ToBlob(audioBase64, mimeType);
  const formData = new FormData();

  const extension = getAudioExtension(mimeType);
  formData.append("file", audioBlob, `input.${extension}`);
  formData.append("model", "gpt-4o-mini-transcribe");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI STT Error: ${response.status} ${errorText}`);
  }

  const json = await response.json();

  // Validate response structure
  if (!json || typeof json !== 'object') {
    throw new Error(`OpenAI STT Error: Invalid response format. Status: ${response.status}`);
  }

  if (!json.text || typeof json.text !== 'string') {
    const errorDetails = json.error ? JSON.stringify(json.error) : JSON.stringify(json);
    throw new Error(`OpenAI STT Error: Missing or invalid transcription text. Status: ${response.status}, Response: ${errorDetails}`);
  }

  if (json.text.trim().length === 0) {
    throw new Error(`OpenAI STT Error: Transcription returned empty text. Status: ${response.status}`);
  }

  return json.text;
};

/**
 * Maps browser MIME types to OpenAI input_audio format strings.
 * gpt-4o-audio-preview only supports 'wav' and 'mp3' for input_audio.format.
 */
const getAudioInputFormat = (mimeType: string): string => {
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes('wav')) return 'wav';
  if (lowerMime.includes('mp3') || lowerMime.includes('mpeg')) return 'mp3';
  throw new Error(
    `Unsupported audio format for gpt-4o-audio-preview input_audio: "${mimeType}". ` +
    `Only wav and mp3 are supported. The recorded audio must be transcoded before calling this API.`
  );
};

/**
 * Transcribes audio and produces both a raw transcript and a cleaned-up version
 * in a single LLM call using structured output via chat completions with audio input.
 */
export const transcribeAndCleanupAudioOpenAI = async (
  audioBase64: string,
  mimeType: string
): Promise<{ rawTranscript: string; cleanedTranscript: string }> => {
  const apiKey = getApiKeyOrEnv('openai');

  if (!apiKey) {
    throw new Error("Missing OpenAI API Key");
  }

  const format = getAudioInputFormat(mimeType);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-audio-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Listen to this audio and produce two versions of the transcript:

1. "rawTranscript": Transcribe the audio exactly as spoken, including all filler words, false starts, repetitions, self-corrections, and hesitations.

2. "cleanedTranscript": A cleaned-up version of the same transcript with the following removed:
   - Filler words (um, uh, like, you know, so, etc.)
   - False starts and repetitions
   - Self-corrections and clarifications (e.g., "I mean", "actually", "wait no")
   - Verbal pauses and hesitations
   The cleaned version should preserve the core meaning and intent, reading smoothly while staying natural.`
            },
            {
              type: "input_audio",
              input_audio: {
                data: audioBase64,
                format: format
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "transcript_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              rawTranscript: {
                type: "string",
                description: "Exact transcription of the audio as spoken, including all filler words and hesitations"
              },
              cleanedTranscript: {
                type: "string",
                description: "Cleaned-up version with fillers, false starts, and self-corrections removed"
              }
            },
            required: ["rawTranscript", "cleanedTranscript"],
            additionalProperties: false
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Error: ${response.status} ${errorText}`);
  }

  const json = await response.json();

  if (!json?.choices?.[0]?.message?.content) {
    throw new Error("OpenAI returned empty response for transcription");
  }

  const content = json.choices[0].message.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse OpenAI transcription response: ${errorMessage}. Raw content: ${content}`);
  }

  return {
    rawTranscript: parsed.rawTranscript || "",
    cleanedTranscript: parsed.cleanedTranscript || "",
  };
};

/**
 * Sends a user audio blob to OpenAI models and returns the response with audio and text.
 * Pipeline: gpt-4o-mini-transcribe (STT) -> gpt-5-nano (Chat) -> gpt-4o-mini-tts (Speech)
 */
export const sendVoiceMessageOpenAI = async (
  audioBase64: string,
  mimeType: string
): Promise<VoiceResponse> => {
  const apiKey = getApiKeyOrEnv('openai');

  if (!apiKey) {
    throw new Error("Missing OpenAI API Key");
  }

  try {
    // --- Step 1: STT (gpt-4o-mini-transcribe) ---
    const audioBlob = base64ToBlob(audioBase64, mimeType);
    const formData = new FormData();
    
    const extension = getAudioExtension(mimeType);
    formData.append("file", audioBlob, `input.${extension}`);
    formData.append("model", "gpt-4o-mini-transcribe");

    const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });

    if (!sttRes.ok) {
      const errorText = await sttRes.text();
      throw new Error(`OpenAI STT Error: ${sttRes.status} ${errorText}`);
    }
    const sttJson = await sttRes.json();
    const userText = sttJson.text;

    // --- Step 2: Chat (gpt-5-nano) ---
    // Build messages array with system instruction, shared conversation history, and current user message
    // Use scenario-aware instructions if a scenario is active
    const systemInstruction = activeScenario
      ? generateScenarioSystemInstruction(activeScenario)
      : SYSTEM_INSTRUCTION;

    const conversationHistory = getConversationHistory();
    const messages = [
      { role: "system" as const, content: systemInstruction },
      ...conversationHistory,
      { role: "user" as const, content: userText }
    ];

    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        messages: messages
      })
    });

    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      throw new Error(`OpenAI Chat Error: ${chatRes.status} ${errorText}`);
    }
    const chatJson = await chatRes.json();

    // Defensive validation
    if (!chatJson || typeof chatJson !== 'object' || !Array.isArray(chatJson.choices) || chatJson.choices.length === 0) {
      throw new Error(`OpenAI Chat Error: Invalid response format. Status: ${chatRes.status}`);
    }

    const firstChoice = chatJson.choices[0];
    if (!firstChoice?.message?.content || typeof firstChoice.message.content !== 'string') {
      throw new Error(`OpenAI Chat Error: Missing or invalid message content. Status: ${chatRes.status}`);
    }

    const rawModelText = firstChoice.message.content;

    // Parse hint from response (only present in scenario mode)
    const { text: modelText, hint } = activeScenario
      ? parseHintFromResponse(rawModelText)
      : { text: rawModelText, hint: null };

    // Add user and assistant messages to shared conversation history (use text without hint markers)
    addToHistory("user", userText);
    addToHistory("assistant", modelText);

    // --- Step 3: TTS (gpt-4o-mini-tts) --- (use text without hint)
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: modelText,
        voice: "coral",
        instructions: "Speak clearly with a friendly, encouraging tone. When speaking French, use a natural French accent."
      })
    });

    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      throw new Error(`OpenAI TTS Error: ${ttsRes.status} ${errorText}`);
    }
    const audioArrayBuffer = await ttsRes.arrayBuffer();
    const ttsAudioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
    // Note: Callers must call URL.revokeObjectURL(audioUrl) when finished to avoid memory leaks
    const audioUrl = URL.createObjectURL(ttsAudioBlob);

    return {
      audioUrl,
      userText,
      modelText,
      hint: hint || undefined
    };

  } catch (error) {
    console.error("Error communicating with OpenAI:", error);
    throw error;
  }
};
