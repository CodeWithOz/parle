
import { base64ToBlob, decodeAudioData } from "./audioUtils";

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

/**
 * Sends a user audio blob to OpenAI models and returns the response audio buffer.
 * Pipeline: Whisper (STT) -> GPT-4o (Chat) -> TTS-1 (Speech)
 */
export const sendVoiceMessageOpenAI = async (
  audioBase64: string,
  mimeType: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OpenAI API Key");
  }

  try {
    // --- Step 1: STT (Whisper) ---
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
    formData.append("model", "whisper-1");

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

    // --- Step 2: Chat (GPT-4o) ---
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: userText }
        ]
      })
    });

    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      throw new Error(`OpenAI Chat Error: ${chatRes.status} ${errorText}`);
    }
    const chatJson = await chatRes.json();
    const modelText = chatJson.choices[0].message.content;

    // --- Step 3: TTS (tts-1) ---
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "tts-1",
        input: modelText,
        voice: "alloy"
      })
    });

    if (!ttsRes.ok) {
      const errorText = await ttsRes.text();
      throw new Error(`OpenAI TTS Error: ${ttsRes.status} ${errorText}`);
    }
    const audioArrayBuffer = await ttsRes.arrayBuffer();

    // Decode the standard MP3/WAV returned by OpenAI
    return await decodeAudioData(new Uint8Array(audioArrayBuffer), audioContext);

  } catch (error) {
    console.error("Error communicating with OpenAI:", error);
    throw error;
  }
};
