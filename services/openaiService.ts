import { base64ToBlob, decodeAudioData } from "./audioUtils";
import { VoiceResponse, Scenario } from "../types";
import { getConversationHistory, addToHistory } from "./conversationHistory";
import { generateScenarioSystemInstruction, generateScenarioSummaryPrompt } from "./scenarioService";
import { getApiKeyOrEnv } from "./apiKeyService";

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
 * Sets the active scenario for OpenAI service.
 */
export const setScenarioOpenAI = (scenario: Scenario | null) => {
  activeScenario = scenario;
};

/**
 * Gets AI's understanding/summary of a scenario description using OpenAI.
 */
export const processScenarioDescriptionOpenAI = async (description: string): Promise<string> => {
  const apiKey = getApiKeyOrEnv('openai');

  if (!apiKey) {
    throw new Error("Missing OpenAI API Key");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        { role: "user", content: generateScenarioSummaryPrompt(description) }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Error: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  return json.choices[0].message.content || "I understand the scenario. Ready to begin when you are!";
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

  // Determine appropriate extension based on mimeType
  let extension = 'wav';
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes('webm')) extension = 'webm';
  else if (lowerMime.includes('mp4') || lowerMime.includes('m4a') || lowerMime.includes('aac')) extension = 'm4a';
  else if (lowerMime.includes('ogg')) extension = 'ogg';
  else if (lowerMime.includes('mp3')) extension = 'mp3';

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
  return json.text || "";
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
    
    // Determine appropriate extension based on mimeType
    let extension = 'wav'; // Default
    const lowerMime = mimeType.toLowerCase();
    if (lowerMime.includes('webm')) extension = 'webm';
    else if (lowerMime.includes('mp4') || lowerMime.includes('m4a') || lowerMime.includes('aac')) extension = 'm4a';
    else if (lowerMime.includes('ogg')) extension = 'ogg';
    else if (lowerMime.includes('mp3')) extension = 'mp3';

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
    const modelText = chatJson.choices[0].message.content;

    // Add user and assistant messages to shared conversation history
    addToHistory("user", userText);
    addToHistory("assistant", modelText);

    // --- Step 3: TTS (gpt-4o-mini-tts) ---
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
    const audioUrl = URL.createObjectURL(ttsAudioBlob);

    return {
      audioUrl,
      userText,
      modelText
    };

  } catch (error) {
    console.error("Error communicating with OpenAI:", error);
    throw error;
  }
};
