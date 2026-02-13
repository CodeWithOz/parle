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
  // Check if this is a multi-character scenario
  const isMultiCharacter = scenario.characters && scenario.characters.length > 1;

  if (isMultiCharacter) {
    return generateMultiCharacterSystemInstruction(scenario);
  }

  // Single-character scenario with JSON response format
  return `You are participating in a role-play scenario to help the user practice French.

SCENARIO CONTEXT:
${scenario.description}

YOUR ROLE:
You are playing the role of the other party in the scenario (e.g., shopkeeper, baker, waiter, receptionist, etc.). Follow the general flow of events as described, but respond naturally to what the user says.

RESPONSE FORMAT (CRITICAL):
You MUST respond with structured JSON in this exact format:
{
  "french": "Your complete French response here",
  "english": "The English translation here",
  "hint": "Brief description of what the user should say next"
}

Example:
{
  "french": "Bonjour! Bienvenue dans notre boulangerie. Que puis-je faire pour vous?",
  "english": "Hello! Welcome to our bakery. What can I do for you?",
  "hint": "Greet the baker and ask about bread"
}

GUIDELINES:
1. Stay in character as the other party in the scenario
2. Speak in French primarily
3. If the user makes French mistakes, gently model the correct form in your response while staying in character
4. Follow the scenario progression, but adapt naturally to what the user actually says
5. For EVERY response, you MUST provide:
   - "french": Your COMPLETE French response (in character)
   - "english": The COMPLETE ENGLISH translation
   - "hint": Brief description of what the user should say or ask next (in English)
6. When the scenario reaches its natural end, congratulate the user and offer to practice again or try a variation

ON-DEMAND HINTS:
If the user says "hint", "help", "aide", "je ne sais pas", or seems stuck (very short response, hesitation words like "um", "euh", "uh"), provide a helpful suggestion in your French response.

PROACTIVE HINTS (REQUIRED):
For EVERY response, you MUST include a "hint" field with a brief description of what the user should say or ask next, in English. Focus on the TOPIC or ACTION, not the exact French words.

The hint should:
- Describe WHAT to say, not HOW to say it (e.g., "Ask about opening hours" NOT "Je voudrais savoir...")
- Be action-oriented (e.g., "Thank them and say goodbye", "Ask for the price", "Confirm your order")
- Guide the conversation direction without giving away the French words
- Be brief - just a few words describing the next logical step

START THE SCENARIO:
Begin by greeting the user in character and initiating the scenario. For example, if it's a bakery scenario, greet them as the baker would.`;
};

/**
 * Generate the system instruction for multi-character scenario practice mode
 */
export const generateMultiCharacterSystemInstruction = (scenario: Scenario): string => {
  const characterMapping = scenario.characters!.map((c, i) => `- "Character ${i + 1}" = ${c.name} (${c.role})`).join('\n');
  const exampleResponses = scenario.characters!.slice(0, 2).map((_, i) => `    {
      "characterName": "Character ${i + 1}",
      "french": "${i === 0 ? 'Bonjour! Bienvenue! Que désirez-vous aujourd\'hui?' : 'Ça fait cinq euros, s\'il vous plaît.'}",
      "english": "${i === 0 ? 'Hello! Welcome! What would you like today?' : 'That\'s five euros, please.'}"
    }`).join(',\n');

  return `You are participating in a multi-character role-play scenario to help the user practice French.

SCENARIO CONTEXT:
${scenario.description}

YOUR ROLE:
You control MULTIPLE characters in this scenario. Each character is assigned a fixed label:
${characterMapping}

Each character should respond naturally based on their role. Multiple characters can respond in one turn if contextually appropriate.

RESPONSE FORMAT (CRITICAL):
You MUST respond with structured JSON. You MUST use the EXACT fixed labels ("Character 1", "Character 2", etc.) as the "characterName" — NOT the character's actual name or role.

Example:
{
  "characterResponses": [
${exampleResponses}
  ],
  "hint": "Ask what you'd like to buy"
}

IMPORTANT:
- You MUST use EXACTLY "Character 1", "Character 2", etc. as characterName values — never the actual name or role
- Put the French response in the "french" field and the English translation in the "english" field
- Keep French and English SEPARATE - do NOT combine them
- Include a "hint" field with every response

GUIDELINES:
1. Stay in character for each speaker
2. Speak in French primarily for each character
3. If the user makes French mistakes, gently model the correct form in your response while staying in character
4. Follow the scenario progression, but adapt naturally to what the user actually says
5. Each character's response MUST follow this structure:
   - Put their COMPLETE French response (in character) in the "french" field
   - Put the COMPLETE ENGLISH translation in the "english" field
   - Do NOT combine French and English in one field
6. Decide which character(s) should respond based on the context
7. CRITICAL: If a character needs to say multiple things in one turn, combine ALL of their dialogue into ONE response entry. NEVER create successive responses from the same character. Each character should appear AT MOST ONCE in the characterResponses array per turn.
8. When the scenario reaches its natural end, have the appropriate character(s) congratulate the user

ON-DEMAND HINTS:
If the user says "hint", "help", "aide", "je ne sais pas", or seems stuck, have the appropriate character provide a helpful suggestion.

PROACTIVE HINTS (REQUIRED):
For EVERY response, you MUST include a "hint" field in the JSON with a brief description of what the user should say or ask next, in English. Focus on the TOPIC or ACTION, not the exact French words. Example: "Ask what you'd like to buy" or "Thank them and say goodbye".

START THE SCENARIO:
Begin by having the appropriate character(s) greet the user and initiate the scenario.`;
};

/**
 * Parse the hint section from an AI response
 * Returns the hint text and the response without the hint section
 */
export const parseHintFromResponse = (response: string): { text: string; hint: string | null } => {
  const hintMatch = response.match(/---HINT---\s*([\s\S]*?)\s*---END_HINT---/);

  if (hintMatch) {
    let hint = hintMatch[1].trim();
    // Remove leading/trailing square brackets if present (e.g., "[Tell the baker...]" -> "Tell the baker...")
    hint = hint.replace(/^\[|\]$/g, '').trim();
    const text = response.replace(/---HINT---[\s\S]*?---END_HINT---/, '').trim();
    return { text, hint };
  }

  return { text: response, hint: null };
};

/**
 * Parse a multi-character response from the AI
 * Format: [CHARACTER_NAME]: text... [CHARACTER_NAME]: text...
 * Returns array of character responses and extracted hint
 */
export const parseMultiCharacterResponse = (
  response: string,
  scenario: Scenario
): {
  characterResponses: Array<{ characterId: string; characterName: string; text: string }>;
  hint: string | null;
} => {
  // First extract hint
  const { text: responseWithoutHint, hint } = parseHintFromResponse(response);

  // Parse character responses using regex: [CHARACTER_NAME]: text
  const characterPattern = /\[([^\]]+)\]:\s*([^\[]*?)(?=\[|$)/g;
  const matches = [...responseWithoutHint.matchAll(characterPattern)];

  if (matches.length === 0) {
    // No character markers found - treat as single response from first character
    const firstCharacter = scenario.characters?.[0];
    if (firstCharacter) {
      return {
        characterResponses: [{
          characterId: firstCharacter.id,
          characterName: firstCharacter.name,
          text: responseWithoutHint.trim()
        }],
        hint
      };
    }
    // Fallback if no characters defined
    return {
      characterResponses: [{
        characterId: 'default',
        characterName: 'AI',
        text: responseWithoutHint.trim()
      }],
      hint
    };
  }

  const characterResponses = matches.map(match => {
    const characterName = match[1].trim();
    const text = match[2].trim();

    // Find character by name (exact match, case-insensitive)
    // With structured outputs, names should always match exactly
    const character = scenario.characters?.find(
      c => c.name.toLowerCase() === characterName.toLowerCase()
    );

    return {
      characterId: character?.id || `unknown_${characterName}`,
      characterName: character?.name || characterName,
      text
    };
  });

  // Merge consecutive responses from the same character
  const mergedResponses = characterResponses.reduce<Array<{ characterId: string; characterName: string; text: string }>>((acc, current) => {
    if (acc.length === 0) {
      return [current];
    }

    const lastResponse = acc[acc.length - 1];
    if (lastResponse.characterId === current.characterId) {
      // Same character - merge the text with a space
      lastResponse.text = `${lastResponse.text} ${current.text}`;
      return acc;
    }

    // Different character - add as new response
    return [...acc, current];
  }, []);

  return { characterResponses: mergedResponses, hint };
};

/**
 * Generate a prompt to have the AI summarize and confirm understanding of a scenario
 */
export const generateScenarioSummaryPrompt = (description: string): string => {
  return `The user wants to practice a French conversation based on this real experience:

"${description}"

Please analyze this scenario and identify:
1. ALL distinct characters/people the user will interact with in this scenario
2. If only one character is mentioned or implied, return an array with just that one character
3. Character names should be role-based (e.g., "Baker", "Cashier", "Waiter", "Manager")
4. Keep role descriptions short and lowercase (e.g., "baker", "cashier")
5. Write a brief 2-3 sentence summary confirming understanding and readiness to begin

Example for "I went to a bakery and spoke to the baker about bread, then paid the cashier":
- Summary: "I understand! You visited a bakery where you'll speak with the baker about bread options, and then complete your purchase with the cashier. I'll play both the baker and cashier roles. Ready to begin when you are!"
- Characters: Baker (role: baker, friendly and knowledgeable), Cashier (role: cashier, efficient and helpful)`;
};
