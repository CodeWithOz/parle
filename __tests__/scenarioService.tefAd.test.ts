import { describe, it, expect } from 'vitest';
import { generateTefAdSystemInstruction } from '../services/scenarioService';

describe('generateTefAdSystemInstruction', () => {
  const adSummary = 'A promotional image for a luxury car featuring a red sports car on an empty road with the tagline "Drive the Future."';
  const roleConfirmation = 'I understand! This ad promotes a luxury sports car. I will act as your skeptical friend and raise persuasive objections to help you practice defending the product.';

  it('returns a string', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    expect(typeof result).toBe('string');
  });

  it('includes the adSummary in the output', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain(adSummary);
  });

  it('includes the roleConfirmation in the output', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain(roleConfirmation);
  });

  it('mentions French (the language) in the output', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    // Case-insensitive match — could appear as "French" or "french"
    expect(result.toLowerCase()).toContain('french');
  });

  it('contains JSON format instructions referencing "french", "english", and "hint" fields', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain('"french"');
    expect(result).toContain('"english"');
    expect(result).toContain('"hint"');
  });

  it('contains instructions to act as a friend who raises objections', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // Should instruct the AI to be a friend raising objections / being persuaded
    expect(lower).toMatch(/friend|objection|skeptic|persuad/);
  });

  it('does NOT contain hardcoded "5 distinct objection directions" language (counting moved to client)', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    // The prompt is now simplified — the 5-direction counting is done deterministically on the
    // client, so the system prompt must NOT embed these exact numbers.
    expect(result).not.toMatch(/5\s+distinct\s+objection\s+directions/i);
  });

  it('instructs AI to reference ad/image claims in objections', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    // The instruction should tell the AI to ground objections in the ad's own content
    expect(result).toMatch(/(?:ad|image|advertisement).*(?:claim|content|detail)/i);
  });

  it('instructs AI not to make the user\'s arguments or do the persuading itself', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/never make the user'?s arguments|do not do the user'?s job|only object.*react|user must do the persuading/);
  });

  it('instructs AI not to jump into ad substance; pose objections and let user respond', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    const userIntroduces = lower.includes("user's job to introduce") || lower.includes('user to introduce the topic');
    const friendWaits = lower.includes('wait for the user to introduce') || lower.includes('only after the user has introduced');
    const noMentionAdFirst = lower.includes('do not mention the ad') || lower.includes("don't mention the ad");
    expect(userIntroduces || (friendWaits && noMentionAdFirst)).toBe(true);
  });

  it('does NOT contain hardcoded round/total counts ("3 rounds", "15 total") — tracking moved to client', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // Round counting is now done deterministically on the client side and injected
    // as per-turn context. The system prompt should not duplicate these numbers.
    expect(lower).not.toMatch(/3 rounds of pushback|at least 3 rounds/);
    expect(lower).not.toMatch(/15.*pushback|pushback.*15/);
  });

  it('references per-turn context for objection tracking', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // The simplified system prompt must tell the AI to follow the per-turn context
    // that will be injected at runtime instead of hardcoded counting rules.
    expect(lower).toMatch(/per.?turn context/);
  });

  it('does NOT contain "5 directions" as a hardcoded count', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    expect(result).not.toMatch(/\b5\b.*directions|directions.*\b5\b/i);
  });
});
