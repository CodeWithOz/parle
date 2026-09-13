import { Scenario } from '../types';
import { deleteSavedScenario, listSavedScenarios, saveSavedScenario } from './tefArchiveService';
import {
  generateMultiCharacterSystemInstruction,
  generateScenarioSummaryPrompt,
  generateScenarioSystemInstruction,
  generateTefAdSystemInstruction,
  generateTefQuestioningSystemInstruction,
  getScenarioSteps,
} from '../shared/prompts';

export {
  generateMultiCharacterSystemInstruction,
  generateScenarioSummaryPrompt,
  generateScenarioSystemInstruction,
  generateTefAdSystemInstruction,
  generateTefQuestioningSystemInstruction,
  getScenarioSteps,
};

/**
 * Defensive fallback seed for the roadmap editor: break a scenario summary
 * into rough per-sentence steps the user can then edit/reorder.
 *
 * The primary source of roadmap steps is the AI-generated `steps` array
 * returned by `processScenarioDescriptionOpenAI` (services/openaiService.ts),
 * as part of the same structured-output scenario-planning call that produces
 * `summary`/`characters` — no extra request. This heuristic only runs when
 * that call didn't return usable steps: a non-JSON legacy response, or the
 * model omitting/returning an empty `steps` field.
 */
export function seedRoadmapStepsFromSummary(summary: string): string[] {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [''];
}

/**
 * Generate a unique ID for a scenario
 */
export const generateId = (): string => {
  return `scenario_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Load saved scenarios from the Stage 3 IndexedDB-primary repository.
 */
export const loadScenarios = (): Promise<Scenario[]> => listSavedScenarios();

/**
 * Save a scenario through the IndexedDB-primary repository.
 */
export const saveScenario = (scenario: Scenario): Promise<Scenario[]> => saveSavedScenario(scenario);

/**
 * Delete a scenario through the IndexedDB-primary repository.
 */
export const deleteScenario = (scenarioId: string): Promise<Scenario[]> => deleteSavedScenario(scenarioId);

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
