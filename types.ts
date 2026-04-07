
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
  audioUrl?: string | string[];
  hint?: string;
  characterId?: string;
  characterName?: string;
  voiceName?: string;
  audioGenerationFailed?: boolean;
  frenchText?: string;
  isRepeat?: boolean;
  conceptLabels?: string[];
}

export interface VoiceResponse {
  audioUrl: string | string[]; // Support array for multi-character
  userText: string;
  modelText: string | string[]; // Support array for multi-character
  hint?: string; // Optional hint for what the user could say next (in roleplay mode)
  voiceName?: string; // Voice used for single-character response (for retry)
  audioGenerationFailed?: boolean; // Track if TTS failed for single-character response
  isRepeat?: boolean; // TEF Questioning: true if the user asked a repeated question
  conceptLabels?: string[]; // TEF Questioning: topic labels for this response
  characters?: Array<{ // Character info for multi-character responses
    characterId: string;
    characterName: string;
    voiceName: string;
    audioGenerationFailed?: boolean; // Track if TTS failed for this character
    frenchText?: string; // French-only text for TTS retry
  }>;
}

export type ScenarioMode = 'none' | 'setup' | 'practice';

export type TefAdMode = 'none' | 'setup' | 'practice';

export type TefQuestioningMode = 'none' | 'setup' | 'practice';

export interface TefAdState {
  image: string | null;         // base64 data URL for preview
  imageMimeType: string | null;
  confirmation: { summary: string; roleSummary: string } | null;
  isActive: boolean;            // TEF practice is running
  isTimedUp: boolean;           // timer reached 600s
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  aiSummary?: string;
  createdAt: number;
  isActive: boolean;
  characters?: Character[]; // NEW: Characters in this scenario
  isTefQuestioning?: boolean; // TEF Questioning: use the questioning-specific response schema
}

/**
 * Represents recorded audio data that can be stored for retry operations
 */
export interface AudioData {
  base64: string;
  mimeType: string;
}

/**
 * Tracks deterministic objection state for TEF Ad Persuasion practice.
 * 5 pre-generated directions × 3 rounds each = 15 total rounds.
 */
export interface TefObjectionState {
  directions: string[];      // 5 pre-generated objection topics
  currentDirection: number;  // 0-4
  currentRound: number;      // 0-2 (3 rounds per direction)
  isConvinced: boolean;      // true after all 15 rounds complete
}

export interface TefReviewMistake {
  original: string;     // What the user said
  correction: string;   // Corrected phrase
  explanation: string;  // Why, in plain English
}

export interface TefReviewVocabSuggestion {
  used: string;
  better: string;
  reason: string;
}

export interface TefReview {
  cefrLevel: string;                           // e.g. "B2", "C1"
  cefrJustification: string;                   // 1-2 sentences explaining the assessment
  wentWell: string[];
  mistakes: TefReviewMistake[];
  vocabularySuggestions: TefReviewVocabSuggestion[];
  tipsForC1: string[];
}
