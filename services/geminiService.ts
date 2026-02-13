import { GoogleGenAI, Chat, Modality, Type, Schema } from "@google/genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { base64ToBytes, pcmToWav } from "./audioUtils";
import { VoiceResponse, Scenario } from "../types";
import { getConversationHistory, addToHistory } from "./conversationHistory";
import { generateScenarioSystemInstruction, generateScenarioSummaryPrompt, parseHintFromResponse, parseMultiCharacterResponse } from "./scenarioService";
import { getApiKeyOrEnv } from "./apiKeyService";

// Zod schema for multi-character structured output
const CharacterResponseSchema = z.object({
  characterName: z.string().describe("The exact character name from the scenario"),
  text: z.string().describe("The character's complete response (French first, then English translation)")
});

const MultiCharacterResponseSchema = z.object({
  characterResponses: z.array(CharacterResponseSchema).describe("Array of character responses in order"),
  hint: z.string().nullable().optional().describe("Optional hint for what the user should say next")
});

// Gemini TTS output format constants
const DEFAULT_PCM_SAMPLE_RATE = 24000; // 24kHz sample rate
const DEFAULT_PCM_CHANNELS = 1; // Mono audio

// Define the system instruction to enforce the language constraint
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

let ai: GoogleGenAI | null = null;
let chatSession: Chat | null = null;
// Track how many messages from shared history have been synced to the session
let syncedMessageCount = 0;
// Track the active scenario for scenario-aware prompting
let activeScenario: Scenario | null = null;
// Store pending scenario and history when ai is not yet initialized
let pendingScenario: Scenario | null = null;
let pendingHistory: Array<{ role: string; content: string }> | null = null;

/**
 * Helper function to create the chat session with current state.
 * Only call when ai is initialized.
 */
function createChatSession(): void {
  if (!ai) {
    return;
  }

  const systemInstruction = activeScenario
    ? generateScenarioSystemInstruction(activeScenario)
    : SYSTEM_INSTRUCTION;

  // Check if multi-character scenario for JSON response
  const isMultiCharacter = activeScenario && activeScenario.characters && activeScenario.characters.length > 1;

  // Convert history to SDK format if provided
  const historyMessages = pendingHistory ? pendingHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  })) : undefined;

  chatSession = ai.chats.create({
    model: 'gemini-2.0-flash-lite',
    config: {
      systemInstruction: systemInstruction,
      ...(isMultiCharacter && {
        responseMimeType: 'application/json'
      })
    },
    ...(historyMessages && { history: historyMessages }),
  });

  // Update sync counter if history was provided
  if (pendingHistory) {
    syncedMessageCount = pendingHistory.length;
  } else {
    syncedMessageCount = 0;
  }

  // Clear pending history after successful session creation
  pendingHistory = null;
}

/**
 * Resets the Gemini session and sync counter.
 * Should be called when clearing conversation history.
 * Optionally can set a new scenario for scenario-aware prompting.
 * Can optionally pass history to initialize the session with existing messages.
 * 
 * Always persists the scenario and history in state, even if ai is not yet initialized.
 * When ai is initialized later, call this again or initializeSession to create the actual session.
 */
export const resetSession = (scenario?: Scenario | null, history?: Array<{ role: string; content: string }>) => {
  // Always update the module-level state, regardless of ai initialization
  activeScenario = scenario || null;
  pendingScenario = scenario || null;
  
  if (history) {
    pendingHistory = history;
  } else {
    // Only reset sync counter if no history is provided (clearing state)
    syncedMessageCount = 0;
    pendingHistory = null;
  }

  // Only create the actual chat session if ai is initialized
  if (ai) {
    createChatSession();
  }
};

/**
 * Sets the active scenario and resets the session with new instructions.
 */
export const setScenario = (scenario: Scenario | null) => {
  resetSession(scenario);
};

/**
 * Ensures the Gemini AI instance is initialized
 */
function ensureAiInitialized(): void {
  if (!ai) {
    const apiKey = getApiKeyOrEnv('gemini');
    if (!apiKey) {
      throw new Error("Missing Gemini API Key");
    }
    ai = new GoogleGenAI({ apiKey });
  }
}

/**
 * Gets AI's understanding/summary of a scenario description.
 */
export const processScenarioDescription = async (description: string): Promise<string> => {
  ensureAiInitialized();

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: [{
      parts: [{ text: generateScenarioSummaryPrompt(description) }],
    }],
  });

  return response.text || "I understand the scenario. Ready to begin when you are!";
};

/**
 * Transcribes audio to text using Gemini.
 */
export const transcribeAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
  ensureAiInitialized();

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: [{
      parts: [
        { text: "Transcribe this audio exactly as spoken. Only output the transcription, nothing else." },
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
      ],
    }],
  });

  const text = response.text || "";
  if (!text.trim()) {
    throw new Error("Transcription returned empty text");
  }
  return text;
};

/**
 * Transcribes audio and produces both a raw transcript and a cleaned-up version
 * in a single LLM call using structured output.
 */
export const transcribeAndCleanupAudio = async (
  audioBase64: string,
  mimeType: string
): Promise<{ rawTranscript: string; cleanedTranscript: string }> => {
  ensureAiInitialized();

  const response = await ai!.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: [{
      parts: [
        {
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
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rawTranscript: {
            type: Type.STRING,
            description: 'Exact transcription of the audio as spoken, including all filler words and hesitations',
          },
          cleanedTranscript: {
            type: Type.STRING,
            description: 'Cleaned-up version with fillers, false starts, and self-corrections removed',
          },
        },
        required: ['rawTranscript', 'cleanedTranscript'],
      },
    },
  });

  const text = response.text || "";
  if (!text.trim()) {
    throw new Error("Transcription returned empty response");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Gemini transcription response: ${errorMessage}. Raw response: ${text}`);
  }

  return {
    rawTranscript: parsed.rawTranscript || "",
    cleanedTranscript: parsed.cleanedTranscript || "",
  };
};

/**
 * Initializes the Gemini Chat session.
 * Must be called with a valid API Key.
 * Creates a fresh session and uses any pending scenario/history that was set before ai was initialized.
 */
export const initializeSession = async () => {
  ensureAiInitialized();
  // We use gemini-2.0-flash-lite for the logic/conversation as it handles audio input well,
  // but we will ask for TEXT output to maintain REST compatibility, then TTS it.

  // If there was a pending scenario set before ai was initialized, use it
  if (pendingScenario) {
    activeScenario = pendingScenario;
  }

  // Create session with any pending state (scenario, history)
  createChatSession();
};

/**
 * Generate speech audio for a specific character using Gemini TTS
 * @param text The text to convert to speech
 * @param voiceName The Gemini voice name to use
 * @returns Blob URL for the generated audio
 */
export const generateCharacterSpeech = async (
  text: string,
  voiceName: string
): Promise<string> => {
  if (!ai) {
    ensureAiInitialized();
  }

  // Sanitize text to prevent breaking the delimiter
  const sanitizedText = text.replace(/<\/text>/g, '<\\/text>');

  const systemPrompt = `You are to read out the following text in a friendly, encouraging tone. When speaking French, use a natural French accent. You MUST output ONLY AUDIO, not TEXT. Again, ONLY AUDIO, not TEXT. Here's the text enclosed in <text> tags: <text>${sanitizedText}</text>`;

  const ttsResponse = await ai!.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: systemPrompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName
          }
        }
      }
    }
  });

  // Extract audio from TTS response
  const candidate = ttsResponse.candidates?.[0];
  const parts = candidate?.content?.parts;

  if (!parts || parts.length === 0) {
    throw new Error(`No content received from TTS model for character with voice ${voiceName}.`);
  }

  // Find the inline data part which contains the audio
  const audioPart = parts.find(p => p.inlineData);

  if (!audioPart || !audioPart.inlineData) {
    throw new Error(`No audio data received from TTS model for character with voice ${voiceName}.`);
  }

  // Convert base64 to blob and create URL
  const audioBytes = base64ToBytes(audioPart.inlineData.data);
  // Gemini TTS returns raw PCM, convert it to WAV format
  const audioBlob = pcmToWav(audioBytes, DEFAULT_PCM_SAMPLE_RATE, DEFAULT_PCM_CHANNELS);
  const audioUrl = URL.createObjectURL(audioBlob);

  return audioUrl;
};

/**
 * Create Zod schema for multi-character response with exact character names
 */
const createMultiCharacterSchema = (scenario: Scenario) => {
  const characterNames = scenario.characters!.map(c => c.name);

  return z.object({
    characterResponses: z.array(
      z.object({
        characterName: z.enum(characterNames as [string, ...string[]]).describe(`Must be one of: ${characterNames.join(', ')}`),
        text: z.string().describe("The character's complete response (French first, then English translation)")
      })
    ),
    hint: z.string().nullable().optional().describe("Optional hint for what the user should say next")
  });
};

/**
 * Sends a user audio blob to the model and returns the response with audio and text.
 */
export const sendVoiceMessage = async (
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<VoiceResponse> => {
  if (!chatSession || !ai) {
    if (activeScenario) {
      await resetSession(activeScenario);
    } else {
      await initializeSession();
    }
    if (!chatSession || !ai) {
      throw new Error("Chat session not initialized.");
    }
  }

  try {
    // Helper to make API calls cancellable via AbortSignal
    const abortablePromise = <T>(promise: Promise<T>): Promise<T> => {
      if (!signal) return promise;

      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Request aborted', 'AbortError'));
          });
        })
      ]);
    };

    // Step 1: Transcribe user audio
    const transcribeResponse = await abortablePromise(ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: [{
        parts: [
          { text: "Transcribe this audio exactly as spoken. Only output the transcription, nothing else." },
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType,
            },
          },
        ],
      }],
    }));

    const userText = transcribeResponse.text || "";

    // Validate transcription - don't proceed with empty text
    if (!userText || userText.trim().length === 0) {
      throw new Error("Transcription failed or returned empty text. Please try speaking again.");
    }

    // Sync session with shared history if needed (lazy sync when actually sending a message)
    // This happens when switching back to Gemini from another provider
    const sharedHistory = getConversationHistory();
    
    // If there are unsynced messages, recreate the session with full history
    // This avoids redundant API calls from replaying messages one by one
    if (sharedHistory.length > syncedMessageCount) {
      // Recreate session with all history passed directly to the SDK
      resetSession(activeScenario, sharedHistory);
      // Ensure session was created successfully
      if (!chatSession) {
        throw new Error("Failed to sync session with history");
      }
    }
    
    // Step 2: Send User Audio to Chat Model to get Text Response
    const chatResponse = await abortablePromise(chatSession.sendMessage({
      message: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
      ],
    }));

    const rawModelText = chatResponse.text; // Access text property directly

    if (!rawModelText) {
      throw new Error("No text response received from chat model.");
    }

    // Check if this is a multi-character scenario
    if (activeScenario && activeScenario.characters && activeScenario.characters.length > 1) {
      // Parse and validate JSON response with Zod
      const MultiCharacterSchema = createMultiCharacterSchema(activeScenario);
      const jsonResponse = JSON.parse(rawModelText);
      const validated = MultiCharacterSchema.parse(jsonResponse);

      // Map validated response to include character IDs
      const characterResponses = validated.characterResponses.map(resp => {
        const character = activeScenario.characters!.find(c => c.name === resp.characterName)!;
        return {
          characterId: character.id,
          characterName: character.name,
          text: resp.text.trim()
        };
      });

      const parsed = {
        characterResponses,
        hint: validated.hint || null
      };

      // Check if operation was cancelled before updating history
      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      // Generate audio for each character IN PARALLEL
      const audioPromises = parsed.characterResponses.map(async (charResp) => {
        const character = activeScenario.characters.find(c => c.id === charResp.characterId);

        if (!character) {
          throw new Error(`Character not found: ${charResp.characterName} (ID: ${charResp.characterId})`);
        }

        const audioUrl = await generateCharacterSpeech(charResp.text, character.voiceName);
        return { ...charResp, audioUrl, voiceName: character.voiceName };
      });

      const results = await Promise.allSettled(audioPromises);

      // Process results: extract successes and mark failures
      const characterAudios = results.map((result, idx) => {
        if (result.status === 'rejected') {
          console.error(`TTS failed for character ${parsed.characterResponses[idx].characterName}:`, result.reason);
          // Return character data without audio, flagged as failed
          const character = activeScenario.characters.find(c => c.id === parsed.characterResponses[idx].characterId);
          return {
            ...parsed.characterResponses[idx],
            audioUrl: undefined,
            audioGenerationFailed: true,
            voiceName: character?.voiceName || ''
          };
        }
        return { ...result.value, audioGenerationFailed: false };
      });

      // Construct combined text for conversation history (without character markers)
      const combinedModelText = parsed.characterResponses.map(cr => cr.text).join(' ');

      // Sync to shared conversation history
      addToHistory("user", userText);
      addToHistory("assistant", combinedModelText);
      syncedMessageCount += 2;

      // Return multi-character response
      return {
        audioUrl: characterAudios.map(ca => ca.audioUrl),
        modelText: characterAudios.map(ca => ca.text),
        userText,
        hint: parsed.hint || undefined,
        characters: characterAudios.map(ca => ({
          characterId: ca.characterId,
          characterName: ca.characterName,
          voiceName: ca.voiceName,
          audioGenerationFailed: ca.audioGenerationFailed
        }))
      };
    } else {
      // Single-character scenario (original behavior)
      // Parse hint from response (only present in scenario mode)
      const { text: modelText, hint } = activeScenario
        ? parseHintFromResponse(rawModelText)
        : { text: rawModelText, hint: null };

      // Check if operation was cancelled before updating history
      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      // Sync to shared conversation history (use text without hint markers)
      addToHistory("user", userText);
      addToHistory("assistant", modelText);
      // Update sync counter - we've now synced this new message pair
      syncedMessageCount += 2;

      // Step 3: Send Text Response to TTS Model to get Audio (use text without hint)
      // Use character voice if available, otherwise default
      const voiceName = activeScenario?.characters?.[0]?.voiceName || "Aoede";
      const audioUrl = await generateCharacterSpeech(modelText, voiceName);

      return {
        audioUrl,
        userText,
        modelText,
        hint: hint || undefined
      };
    }

  } catch (error) {
    console.error("Error communicating with Gemini:", error);
    throw error;
  }
};