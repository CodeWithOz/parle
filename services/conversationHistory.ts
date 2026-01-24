/**
 * Shared conversation history storage for maintaining context across provider switches.
 * Both Gemini and OpenAI services use this to maintain a unified conversation.
 */

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Module-level conversation history shared across all providers
let conversationHistory: ChatMessage[] = [];

/**
 * Gets the current conversation history
 */
export const getConversationHistory = (): ChatMessage[] => {
  return [...conversationHistory]; // Return a copy to prevent external mutations
};

/**
 * Adds a message to the conversation history
 */
export const addToHistory = (role: "user" | "assistant", content: string): void => {
  conversationHistory.push({ role, content });
};

/**
 * Clears the conversation history
 */
export const clearHistory = (): void => {
  conversationHistory = [];
};

/**
 * Sets the conversation history (useful for restoring or syncing)
 */
export const setHistory = (history: ChatMessage[]): void => {
  conversationHistory = [...history]; // Store a copy
};
