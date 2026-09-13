import { Type } from '@google/genai';
import type { TefReview } from '../../types';

export type ReviewTurn = {
  role: 'user' | 'model';
  text?: string;
  frenchText?: string;
  audioBase64?: string;
  mimeType?: string;
};

const SECTION_A_GUIDANCE = `TEF Canada Oral Expression — Section A: Prise d'information (5 minutes)

WHAT THE TEST EXPECTS:
Ask approximately 10 questions about a classified ad over the phone to a customer service representative. Evaluators assess linguistic skills only — grammar, vocabulary variety, pronunciation, and fluency. The relevance of questions is not graded.

EVALUATION CRITERIA:
- Question formation: correct subject-verb inversion (Habite-t-il ? Va-t-elle ?) or "est-ce que" structure
- Range of interrogative adverbs: quoi/que, qui, quand, où, comment
- Fluency and spontaneity: ability to react to answers and sustain a natural conversation
- Vocabulary breadth: varied and accurate rather than repetitive simple phrases

WHAT EXAMINERS LOOK FOR (tips from the test creators):
- Avoid questions learnt by heart — examiners notice and penalise recitation
- React to the agent's answers to demonstrate comprehension and conversational flexibility
- Aim for a flowing conversation, not 10 isolated questions fired in sequence
- The priority is fluent speech with varied vocabulary`;

const SECTION_B_GUIDANCE = `TEF Canada Oral Expression — Section B: Argumentation (10 minutes)

WHAT THE TEST EXPECTS:
Present a classified ad to a skeptical friend and argue to convince them to participate. Evaluators assess how clearly you present, how persuasively you argue, how well you structure reasoning, and how fluently you adapt to the conversation.

EVALUATION CRITERIA:
- Argumentation vocabulary: verbs of advice (je te conseille de, je te recommande de, je te propose de) and linking words (parce que, car, donc, c'est pourquoi, en effet, d'ailleurs, de plus)
- Use of document context: extract and rephrase information from the ad — do NOT recite it verbatim
- Persuasive structure: arguments that address the friend's situation and objections directly
- Fluency and naturalness in conversation
- Variety and accuracy of vocabulary and sentence structures

WHAT EXAMINERS LOOK FOR (tips from the test creators):
- This is NOT a reading test — rephrase the ad's content, never recite it word for word
- Tailor arguments to the friend's specific context (their interests, situation)
- Justify claims with linking words and reasons, not bare assertions
- Demonstrate understanding of the instructions by adapting to your conversation partner`;

export function tefReviewResponseSchema(exerciseType: 'questioning' | 'persuasion') {
  return {
    type: Type.OBJECT,
    properties: {
      cefrLevel: { type: Type.STRING },
      cefrJustification: { type: Type.STRING },
      wentWell: { type: Type.ARRAY, items: { type: Type.STRING } },
      topicSuggestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            examples: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  french: { type: Type.STRING },
                  english: { type: Type.STRING },
                },
                required: ['french', 'english'],
              },
            },
          },
          required: ['topic', 'examples'],
        },
      },
      ...(exerciseType === 'persuasion'
        ? {
            criteriaEvaluation: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  criterion: { type: Type.STRING },
                  met: { type: Type.BOOLEAN },
                  evidence: { type: Type.STRING },
                },
                required: ['criterion', 'met', 'evidence'],
              },
            },
          }
        : {}),
    },
    required: [
      'cefrLevel',
      'cefrJustification',
      'wentWell',
      'topicSuggestions',
      ...(exerciseType === 'persuasion' ? ['criteriaEvaluation'] : []),
    ],
  };
}

export function buildTefReviewParts(params: {
  exerciseType: 'questioning' | 'persuasion';
  elapsedSeconds: number;
  adSummary?: string;
  turns: ReviewTurn[];
}): { parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>; responseSchema: ReturnType<typeof tefReviewResponseSchema> } {
  const { exerciseType, elapsedSeconds, adSummary, turns } = params;
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  const exerciseLabel =
    exerciseType === 'questioning'
      ? "TEF Section A – Prise d'information (questioning a customer service agent about an advertisement)"
      : 'TEF Section B – Argumentation (persuading a skeptical friend about an advertisement)';
  const sectionGuidance = exerciseType === 'questioning' ? SECTION_A_GUIDANCE : SECTION_B_GUIDANCE;

  let preamble = `You are an expert French language evaluator specialising in TEF Canada oral expression assessments.

EXERCISE TYPE: ${exerciseLabel}
ELAPSED TIME: ${elapsedSeconds} seconds
TARGET LEVEL: C1

${sectionGuidance}
`;

  if (adSummary) {
    preamble += `\nADVERTISEMENT CONTEXT:\n${adSummary}\n`;
  }

  if (exerciseType === 'persuasion') {
    preamble += `
PERSUASION CRITERIA TO EVALUATE (assess each explicitly in the criteriaEvaluation field):
1. Clear & interesting presentation — Did the user present the advertisement clearly and in an engaging way?
2. Argumentation vocabulary — Did the user use advice verbs (je vous conseille, il faudrait que) and linking words (en revanche, de plus, car, donc, c'est pourquoi)?
3. 3+ distinct arguments — Did the user raise more than three distinct arguments?
4. Arguments developed with examples — Did the user support each argument with a concrete example?
5. Nuanced / counter-arguments — Did the user nuance their position or address counter-arguments?
`;
  }

  preamble += `
EVALUATION SCOPE — IMPORTANT:
Evaluate only the user's French. The [Agent said: ...] lines in the transcript are provided for context only, not for grading. Do not assess the agent, do not grade the agent's French, and do not criticize the agent's performance. Focus all feedback exclusively on what the user said.

AUDIO NOTE: Audio recordings are the primary source for evaluating speech quality (pronunciation, fluency, spontaneous grammar). Use the transcript as a reference guide. Where they conflict, trust the audio.

CONVERSATION TRANSCRIPT:
`;
  parts.push({ text: preamble });

  if (turns.length === 0) {
    parts.push({ text: '[No conversation turns recorded. The user did not speak during this session.]' });
  } else {
    for (const turn of turns) {
      if (turn.role === 'user') {
        if (turn.audioBase64 && turn.mimeType) {
          parts.push({ inlineData: { data: turn.audioBase64, mimeType: turn.mimeType } });
        } else {
          parts.push({ text: `[User said (transcript only — audio unavailable): ${turn.text ?? ''}]` });
        }
      } else {
        parts.push({ text: `[Agent said: ${turn.frenchText || turn.text || ''}]` });
      }
    }
  }

  const topicSuggestionInstructions =
    exerciseType === 'persuasion'
      ? `3. Topic suggestions: suggest at least 5 additional persuasive angles/arguments the user could have used to convince their skeptical friend
   - Each topic should describe an argument angle (e.g. "Le rapport qualité-prix", "La flexibilité des horaires")
   - For EACH suggested topic, provide at least 2 short spoken examples in French that the USER could say TO their friend — persuasive statements from the user's perspective (e.g. "Je te conseille de...", "Tu devrais...", "C'est une super opportunité parce que...")
   - Do NOT write questions the friend would ask — the examples must be convincing things the user (the persuader) could say
   - Include an English translation for each French example`
      : `3. Topic suggestions: suggest at least 5 additional relevant topics/angles the user could have asked about
   - For EACH suggested topic, provide at least 2 short spoken examples in French as questions the user could ask the customer service agent
   - Include an English translation for each French example`;

  parts.push({
    text: `

EVALUATION INSTRUCTIONS:
Based on the conversation above, provide a structured CEFR evaluation. Assess the user's spoken French on:
1. CEFR level (A1, A2, B1, B2, C1, or C2) with a 1–2 sentence justification
2. What the user did well (concrete positive observations)
${topicSuggestionInstructions}

Return ONLY valid JSON matching the required schema. Do not include any markdown or explanation outside the JSON.`,
  });

  return { parts, responseSchema: tefReviewResponseSchema(exerciseType) };
}

export function validateTefReview(parsed: unknown, exerciseType: 'questioning' | 'persuasion'): TefReview {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Review response is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  for (const field of ['cefrLevel', 'cefrJustification', 'wentWell', 'topicSuggestions'] as const) {
    if (!(field in obj)) {
      throw new Error(`Review response missing required field: "${field}"`);
    }
  }
  if (exerciseType === 'persuasion' && !Array.isArray(obj.criteriaEvaluation)) {
    throw new Error('Review response missing required field: "criteriaEvaluation"');
  }
  const topicSuggestions = obj.topicSuggestions;
  if (!Array.isArray(topicSuggestions) || topicSuggestions.length < 5) {
    throw new Error('Review response field "topicSuggestions" has insufficient length: expected at least 5');
  }
  for (let i = 0; i < topicSuggestions.length; i++) {
    const item = topicSuggestions[i] as Record<string, unknown>;
    if (typeof item?.topic !== 'string' || !item.topic.trim()) {
      throw new Error(`Review response field "topicSuggestions[${i}].topic" must be a non-empty string`);
    }
    const examples = item.examples;
    if (!Array.isArray(examples) || examples.length < 2) {
      throw new Error(`Review response field "topicSuggestions[${i}].examples" has insufficient length: expected at least 2`);
    }
    for (let j = 0; j < examples.length; j++) {
      const example = examples[j] as Record<string, unknown>;
      if (typeof example?.french !== 'string' || !example.french.trim()) {
        throw new Error(`Review response field "topicSuggestions[${i}].examples[${j}].french" must be a non-empty string`);
      }
      if (typeof example?.english !== 'string' || !example.english.trim()) {
        throw new Error(`Review response field "topicSuggestions[${i}].examples[${j}].english" must be a non-empty string`);
      }
    }
  }
  return obj as unknown as TefReview;
}
