export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface Message {
  role: 'user' | 'model';
  text?: string; // Optional text representation if we decide to add it later
  timestamp: number;
}
