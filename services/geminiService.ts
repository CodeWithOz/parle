import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { base64ToBytes, decodeAudioData } from "./audioUtils";
import { VoiceResponse, Scenario } from "../types";
import { getConversationHistory, addToHistory } from "./conversationHistory";
import { generateScenarioSystemInstruction, generateScenarioSummaryPrompt } from "./scenarioService";

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

/**
 * Resets the Gemini session and sync counter.
 * Should be called when clearing conversation history.
 * Optionally can set a new scenario for scenario-aware prompting.
 */
export const resetSession = async (scenario?: Scenario | null) => {
  syncedMessageCount = 0;
  activeScenario = scenario || null;

  const systemInstruction = activeScenario
    ? generateScenarioSystemInstruction(activeScenario)
    : SYSTEM_INSTRUCTION;

  if (ai) {
    chatSession = ai.chats.create({
      model: 'gemini-2.0-flash-exp',
      config: {
        systemInstruction: systemInstruction,
      },
    });
  }
};

/**
 * Sets the active scenario and resets the session with new instructions.
 */
export const setScenario = async (scenario: Scenario | null) => {
  await resetSession(scenario);
};

/**
 * Gets AI's understanding/summary of a scenario description.
 */
export const processScenarioDescription = async (description: string): Promise<string> => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
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
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
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

  return response.text || "";
};

/**
 * Initializes the Gemini Chat session.
 * Must be called with a valid API Key.
 * Creates a fresh session without replaying history (history is synced lazily when needed).
 */
export const initializeSession = async () => {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // We use gemini-2.0-flash-exp for the logic/conversation as it handles audio input well, 
  // but we will ask for TEXT output to maintain REST compatibility, then TTS it.
  
  // Create a fresh session - history will be synced lazily when sending a message
  chatSession = ai.chats.create({
    model: 'gemini-2.0-flash-exp', 
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // No responseModalities needed, defaults to text
    },
  });
  
  // Reset sync counter - we'll sync lazily when actually sending a message
  syncedMessageCount = 0;
};

/**
 * Sends a user audio blob to the model and returns the response with audio and text.
 */
export const sendVoiceMessage = async (
  audioBase64: string,
  mimeType: string,
  audioContext: AudioContext
): Promise<VoiceResponse> => {
  if (!chatSession || !ai) {
    initializeSession();
    if (!chatSession || !ai) {
      throw new Error("Chat session not initialized.");
    }
  }

  try {
    // Step 1: Transcribe user audio
    const transcribeResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
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

    const userText = transcribeResponse.text || "";

    // Validate transcription - don't proceed with empty text
    if (!userText || userText.trim().length === 0) {
      throw new Error("Transcription failed or returned empty text. Please try speaking again.");
    }

    // Sync session with shared history if needed (lazy sync when actually sending a message)
    // This happens when switching back to Gemini from another provider
    const sharedHistory = getConversationHistory();
    
    // Only replay messages that haven't been synced yet
    // We replay user messages to rebuild context (assistant responses are tracked by the session)
    if (sharedHistory.length > syncedMessageCount) {
      // Replay user messages that haven't been synced to rebuild context
      // Note: This will generate API responses, but we ignore them - we just need the context
      // Iterate sequentially and check each message's role
      for (let i = syncedMessageCount; i < sharedHistory.length; i++) {
        const msg = sharedHistory[i];
        // Only replay user messages to rebuild context
        if (msg && msg.role === "user") {
          // Send user message to rebuild context
          await chatSession.sendMessage({
            message: [{ text: msg.content }],
          });
        }
      }
      // Mark all messages as synced
      syncedMessageCount = sharedHistory.length;
    }
    
    // Step 2: Send User Audio to Chat Model to get Text Response
    const chatResponse = await chatSession.sendMessage({
      message: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
      ],
    });

    const modelText = chatResponse.text; // Access text property directly

    if (!modelText) {
      throw new Error("No text response received from chat model.");
    }

    // Sync to shared conversation history
    addToHistory("user", userText);
    addToHistory("assistant", modelText);
    // Update sync counter - we've now synced this new message pair
    syncedMessageCount += 2;

    // Step 3: Send Text Response to TTS Model to get Audio
    const ttsResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: modelText }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: "Aoede"
                    }
                }
            }
        }
    });

    // Extract audio from TTS response
    const candidate = ttsResponse.candidates?.[0];
    const parts = candidate?.content?.parts;

    if (!parts || parts.length === 0) {
      throw new Error("No content received from TTS model.");
    }

    // Find the inline data part which contains the audio
    const audioPart = parts.find(p => p.inlineData);

    if (!audioPart || !audioPart.inlineData) {
      throw new Error("No audio data received from TTS model.");
    }

    const audioBytes = base64ToBytes(audioPart.inlineData.data);
    const audioBuffer = await decodeAudioData(audioBytes, audioContext);

    return {
      audioBuffer,
      userText,
      modelText
    };

  } catch (error) {
    console.error("Error communicating with Gemini:", error);
    throw error;
  }
};