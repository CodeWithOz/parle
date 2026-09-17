export type ReviewTurn = {
  role: 'user' | 'model';
  text?: string;
  frenchText?: string;
  audioBase64?: string;
  mimeType?: string;
};

export function buildScenarioReviewParts(params: {
  turns: ReviewTurn[];
  scenarioName?: string;
  scenarioDescription?: string;
}): Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> {
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  let preamble = `You are reviewing a French role-play conversation.

TASK:
Identify only the user's spoken French turns where the idea was understandable but there is a more standard, established, or idiomatic way to express the same idea in French.

STRICT SCOPE:
- Evaluate only the user's recorded audio turns.
- Use the user's audio as the canonical source for what they said.
- The user's transcript text is only a fallback when audio cannot be fetched.
- Agent turns are context only. Do not evaluate the agent. Do not rewrite the agent.
- Do not give grammar lessons, explanations, CEFR levels, recommendations, or corrections outside the requested rewrites.
- Do not rewrite every sentence. Include only the turns that genuinely sound non-standard or less idiomatic.
- For each selected item, keep the meaning the same and rewrite it in natural, standard French.
- If every user turn already sounds standard enough, return an empty items array.
`;
  if (params.scenarioName) preamble += `\nSCENARIO NAME: ${params.scenarioName}`;
  if (params.scenarioDescription) preamble += `\nSCENARIO CONTEXT: ${params.scenarioDescription}`;
  preamble += `\n\nCONVERSATION:\n`;
  parts.push({ text: preamble });

  for (const turn of params.turns) {
    if (turn.role === 'user') {
      if (turn.audioBase64 && turn.mimeType) {
        parts.push({ inlineData: { data: turn.audioBase64, mimeType: turn.mimeType } });
      } else {
        parts.push({ text: `[User said (transcript fallback only): ${turn.text ?? ''}]` });
      }
      continue;
    }
    parts.push({ text: `[Agent said: ${turn.frenchText || turn.text || ''}]` });
  }

  parts.push({
    text: `
Return ONLY valid JSON matching the required schema:
{
  "items": [
    {
      "original": "what the user said",
      "standard": "a more standard French way to express the same idea"
    }
  ]
}
`,
  });
  return parts;
}
