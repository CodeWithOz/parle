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

  it('mentions requiring 5 distinct objection directions', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    // The instruction should specify exactly 5 objection directions/categories
    expect(result).toMatch(/5.*(?:objection|direction|categor)/i);
  });

  it('instructs AI to reference ad/image claims in objections', () => {
    const result = generateTefAdSystemInstruction(adSummary, roleConfirmation);
    // The instruction should tell the AI to ground objections in the ad's own content
    expect(result).toMatch(/(?:ad|image|advertisement).*(?:claim|content|detail)/i);
  });
});
