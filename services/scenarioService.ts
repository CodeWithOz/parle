import { Scenario } from '../types';

const STORAGE_KEY = 'parle-scenarios';

/**
 * Generate a unique ID for a scenario
 */
export const generateId = (): string => {
  return `scenario_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Load all saved scenarios from localStorage
 */
export const loadScenarios = (): Scenario[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading scenarios from localStorage:', error);
  }
  return [];
};

/**
 * Save a scenario to localStorage
 */
export const saveScenario = (scenario: Scenario): Scenario[] => {
  const scenarios = loadScenarios();
  const existingIndex = scenarios.findIndex(s => s.id === scenario.id);

  if (existingIndex >= 0) {
    scenarios[existingIndex] = scenario;
  } else {
    scenarios.unshift(scenario);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch (error) {
    // If quota exceeded, try removing oldest scenario and retry once
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      if (scenarios.length > 0) {
        scenarios.pop(); // Remove oldest scenario (last in array)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
        } catch (retryError) {
          console.error('Error saving scenario after retry:', retryError);
          throw new Error('Failed to save scenario: storage quota exceeded');
        }
      } else {
        throw new Error('Failed to save scenario: storage quota exceeded');
      }
    } else {
      console.error('Error saving scenario:', error);
      throw error;
    }
  }
  
  return scenarios;
};

/**
 * Delete a scenario from localStorage
 */
export const deleteScenario = (scenarioId: string): Scenario[] => {
  const scenarios = loadScenarios().filter(s => s.id !== scenarioId);
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch (error) {
    console.error('Error deleting scenario:', error);
    throw new Error('Failed to delete scenario from storage');
  }
  
  return scenarios;
};

/**
 * Generate the system instruction for scenario practice mode
 */
export const generateScenarioSystemInstruction = (scenario: Scenario): string => {
  return `You are participating in a role-play scenario to help the user practice French.

SCENARIO CONTEXT:
${scenario.description}

YOUR ROLE:
You are playing the role of the other party in the scenario (e.g., shopkeeper, baker, waiter, receptionist, etc.). Follow the general flow of events as described, but respond naturally to what the user says.

GUIDELINES:
1. Stay in character as the other party in the scenario
2. Speak in French primarily
3. If the user makes French mistakes, gently model the correct form in your response while staying in character
4. Follow the scenario progression, but adapt naturally to what the user actually says
5. For EVERY response, you MUST follow this structure:
   - First, your French response (in character)
   - Then, immediately provide the ENGLISH translation of what you just said
   - Do not say "Here is the translation" or explain the format
6. When the scenario reaches its natural end, congratulate the user and offer to practice again or try a variation

ON-DEMAND HINTS:
If the user says "hint", "help", "aide", "je ne sais pas", or seems stuck (very short response, hesitation words like "um", "euh", "uh"), provide a helpful suggestion in this format:
- First say (in character): "Peut-être vous voulez dire..." (Perhaps you want to say...)
- Then give a hint in French (what they might say next)
- Then the English translation of the hint
- Then wait for them to try again

PROACTIVE HINTS (REQUIRED):
At the END of EVERY response, you MUST include a hint section in EXACTLY this format:

---HINT---
[A short French phrase the user could say next to continue the conversation naturally, based on the scenario context]
[English translation of the hint]
---END_HINT---

The hint should:
- Be a natural next response the user might give in this scenario
- Be appropriate for beginner to intermediate French learners
- Progress the scenario forward logically
- Be 1-2 sentences maximum

START THE SCENARIO:
Begin by greeting the user in character and initiating the scenario. For example, if it's a bakery scenario, greet them as the baker would.`;
};

/**
 * Parse the hint section from an AI response
 * Returns the hint text and the response without the hint section
 */
export const parseHintFromResponse = (response: string): { text: string; hint: string | null } => {
  const hintMatch = response.match(/---HINT---\s*([\s\S]*?)\s*---END_HINT---/);

  if (hintMatch) {
    const hint = hintMatch[1].trim();
    const text = response.replace(/---HINT---[\s\S]*?---END_HINT---/, '').trim();
    return { text, hint };
  }

  return { text: response, hint: null };
};

/**
 * Generate a prompt to have the AI summarize and confirm understanding of a scenario
 */
export const generateScenarioSummaryPrompt = (description: string): string => {
  return `The user wants to practice a French conversation based on this real experience:

"${description}"

Please:
1. Briefly summarize what you understand about the scenario (2-3 sentences)
2. Identify your role (who you will play)
3. Mention the key interactions that will happen
4. Confirm you're ready to begin when they are

Respond in English since we're still in the setup phase.`;
};
