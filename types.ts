
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
}

export interface VoiceResponse {
  audioBuffer: AudioBuffer;
  userText: string;
  modelText: string;
}
