import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { base64ToBytes, decodeAudioData } from "./audioUtils";

// Define the system instruction to enforce the language constraint
const SYSTEM_INSTRUCTION = `
You are a friendly and patient French language tutor. 
Your goal is to help the user practice speaking French.

RULES:
1. Listen to what the user says.
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

/**
 * Initializes the Gemini Chat session.
 * Must be called with a valid API Key.
 */
export const initializeSession = () => {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // We use gemini-2.0-flash-exp for the logic/conversation as it handles audio input well, 
  // but we will ask for TEXT output to maintain REST compatibility, then TTS it.
  chatSession = ai.chats.create({
    model: 'gemini-2.0-flash-exp', 
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // No responseModalities needed, defaults to text
    },
  });
};

/**
 * Sends a user audio blob to the model and returns the response audio buffer.
 */
export const sendVoiceMessage = async (
  audioBase64: string, 
  mimeType: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  if (!chatSession || !ai) {
    initializeSession();
    if (!chatSession || !ai) {
      throw new Error("Chat session not initialized.");
    }
  }

  try {
    // Step 1: Send User Audio to Chat Model to get Text Response
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

    const textResponse = chatResponse.text; // Access text property directly

    if (!textResponse) {
      throw new Error("No text response received from chat model.");
    }

    // Step 2: Send Text Response to TTS Model to get Audio
    const ttsResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: textResponse }] }],
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
    
    return audioBuffer;

  } catch (error) {
    console.error("Error communicating with Gemini:", error);
    throw error;
  }
};