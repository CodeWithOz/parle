
export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export type Provider = 'gemini' | 'openai';

export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  audioUrl?: string; // Blob URL for the audio
  hint?: string; // Optional hint for what the user could say next (in roleplay mode)
}

export interface VoiceResponse {
  audioUrl: string; // Blob URL for the audio
  userText: string;
  modelText: string;
  hint?: string; // Optional hint for what the user could say next (in roleplay mode)
}

export type ScenarioMode = 'none' | 'setup' | 'practice';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  aiSummary?: string;
  createdAt: number;
  isActive: boolean;
}

/**
 * Represents recorded audio data that can be stored for retry operations
 */
export interface AudioData {
  base64: string;
  mimeType: string;
}
