import { z } from 'zod';
import type { Scenario } from '../types';

export const MAX_CHARACTERS = 5;

export const SingleCharacterSchema = z.object({
  french: z.string().describe('The complete response in French only'),
  english: z.string().describe('The English translation of the French response'),
  hint: z.string().describe('Hint for what the user should say or ask next - brief description in English'),
});

export const TefQuestioningSchema = z.object({
  french: z.string().describe('The complete response in French only'),
  english: z.string().describe('The English translation of the French response'),
  hint: z.string().describe('Suggestion of a question the user could ask next - brief description in English'),
  isRepeat: z.boolean().optional().describe('true if the user asked a question that was already answered'),
  conceptLabels: z.array(z.string()).describe(
    "Array of 2-4 word topic labels in English for the question asked (e.g. ['pricing', 'opening hours']). Always include this field — use an empty array if no topic applies."
  ),
});

export const RoadmapSingleCharacterSchema = SingleCharacterSchema.extend({
  currentStepIndex: z.number().int().min(0).describe(
    '0-based index into the scenario roadmap steps list (given in the system instruction) of the step the conversation currently reflects.'
  ),
});

export const FreeConversationSchema = z.object({
  french: z.string().describe('The complete response in French only'),
  english: z.string().describe('The English translation of the French response'),
});

export const ImageAnalysisSchema = z.object({
  summary: z.string().min(1),
  roleSummary: z.string().min(1),
});

export const TranscribeCleanupSchema = z.object({
  rawTranscript: z.string(),
  cleanedTranscript: z.string(),
});

export const ScenarioSummarySchema = z.object({
  summary: z.string().describe('Brief 2-3 sentence summary of the scenario'),
  characters: z.array(z.object({
    name: z.string().describe('Character name (e.g., Baker, Waiter, Manager)'),
    role: z.string().describe('Brief role description (e.g., baker, waiter, hotel receptionist)'),
  })).min(1).max(5).describe('All distinct characters/people the user will interact with in this scenario (1-5 characters)'),
  steps: z.array(z.string()).min(2).max(8).describe(
    "An ordered list of 2-8 short, concrete conversational beats the user will go through in this scenario"
  ),
});

export const createMultiCharacterSchema = (scenario: Scenario) => {
  const count = Math.min(scenario.characters!.length, MAX_CHARACTERS);
  const labels = Array.from({ length: count }, (_, i) => `Character ${i + 1}`);

  const base = z.object({
    characterResponses: z.array(
      z.object({
        characterName: z.string().describe(`Must be one of: ${labels.join(', ')}`),
        french: z.string().describe("The character's complete response in French only"),
        english: z.string().describe('The English translation of the French response'),
        hint: z.string().optional().describe('Optional per-character hint'),
      })
    ),
    hint: z.string().optional().describe('Hint for what the user should say or ask next - brief description in English'),
  });

  const hasRoadmapSteps = !!scenario.steps && scenario.steps.length > 0;
  return hasRoadmapSteps
    ? base.extend({
        currentStepIndex: z.number().int().min(0).describe(
          '0-based index into the scenario roadmap steps list (given in the system instruction) of the step the conversation currently reflects.'
        ),
      })
    : base;
};

export function toGeminiSchema(jsonSchema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (jsonSchema.type) result.type = (jsonSchema.type as string).toUpperCase();
  if (jsonSchema.description) result.description = jsonSchema.description;
  if (jsonSchema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(jsonSchema.properties as Record<string, Record<string, unknown>>).map(
        ([k, v]) => [k, toGeminiSchema(v)]
      )
    );
  }
  if (jsonSchema.items) result.items = toGeminiSchema(jsonSchema.items as Record<string, unknown>);
  if (jsonSchema.required) result.required = jsonSchema.required;
  if (jsonSchema.anyOf) {
    result.anyOf = (jsonSchema.anyOf as Record<string, unknown>[]).map(toGeminiSchema);
  }
  if (jsonSchema.enum) result.enum = jsonSchema.enum;
  if (jsonSchema.nullable !== undefined) result.nullable = jsonSchema.nullable;
  return result;
}

export function selectZodChatSchema(scenario: Scenario | null) {
  if (scenario && scenario.characters && scenario.characters.length > 1) {
    return createMultiCharacterSchema(scenario);
  }
  if (!scenario) {
    return FreeConversationSchema;
  }
  if (scenario.isTefQuestioning) {
    return TefQuestioningSchema;
  }
  if (scenario.steps && scenario.steps.length > 0) {
    return RoadmapSingleCharacterSchema;
  }
  return SingleCharacterSchema;
}

export function selectGeminiResponseSchema(scenario: Scenario | null): Record<string, unknown> {
  return toGeminiSchema(z.toJSONSchema(selectZodChatSchema(scenario)) as Record<string, unknown>);
}
