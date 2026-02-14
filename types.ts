
export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export type Provider = 'gemini' | 'openai';

export interface Character {
  id: string;
  name: string;
  role: string;
  voiceName: string;
  description?: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  audioUrl?: string | string[]; // Blob URL for the audio (array for multi-character)
  hint?: string; // Optional hint for what the user could say next (in roleplay mode)
  characterId?: string; // NEW: ID of the character who spoke
  characterName?: string; // NEW: Name of the character who spoke
  voiceName?: string; // NEW: Voice used for this message
  audioGenerationFailed?: boolean; // NEW: Track if audio TTS failed
  frenchText?: string; // French-only text for TTS retry (in bilingual scenarios)
}

export interface VoiceResponse {
  audioUrl: string | string[]; // Support array for multi-character
  userText: string;
  modelText: string | string[]; // Support array for multi-character
  hint?: string; // Optional hint for what the user could say next (in roleplay mode)
  voiceName?: string; // Voice used for single-character response (for retry)
  audioGenerationFailed?: boolean; // Track if TTS failed for single-character response
  characters?: Array<{ // Character info for multi-character responses
    characterId: string;
    characterName: string;
    voiceName: string;
    audioGenerationFailed?: boolean; // Track if TTS failed for this character
    frenchText?: string; // French-only text for TTS retry
  }>;
}

export type ScenarioMode = 'none' | 'setup' | 'practice';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  aiSummary?: string;
  createdAt: number;
  isActive: boolean;
  characters?: Character[]; // NEW: Characters in this scenario
}

/**
 * Represents recorded audio data that can be stored for retry operations
 */
export interface AudioData {
  base64: string;
  mimeType: string;
}
