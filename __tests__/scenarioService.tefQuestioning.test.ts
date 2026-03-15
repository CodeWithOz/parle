import { describe, it, expect } from 'vitest';
import { generateTefQuestioningSystemInstruction } from '../services/scenarioService';

describe('generateTefQuestioningSystemInstruction', () => {
  const adSummary = 'A promotional flyer for a local internet provider offering 500 Mbps fibre plans with the tagline "Connectez votre avenir."';
  const roleConfirmation = 'I understand! This ad promotes a high-speed internet service. I will act as a brief and professional customer service agent who only answers what is asked.';

  it('returns a string', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(typeof result).toBe('string');
  });

  it('includes the adSummary in the output', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain(adSummary);
  });

  it('includes the roleConfirmation in the output', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain(roleConfirmation);
  });

  it('mentions "customer service" (not "friend")', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toContain('customer service');
    expect(lower).not.toMatch(/\byou are.*friend\b/);
  });

  it('contains JSON format field "french"', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain('"french"');
  });

  it('contains JSON format field "english"', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain('"english"');
  });

  it('contains JSON format field "hint"', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain('"hint"');
  });

  it('contains JSON format field "isRepeat"', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain('"isRepeat"');
  });

  it('instructs AI to be brief and not volunteer unrequested information', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // Should tell AI to answer only what is asked and not volunteer extra info
    expect(lower).toMatch(/only answer.*asked|do not volunteer|answer only what|brief.*accurate|not volunteer/);
  });

  it('instructs AI to flag repeated questions via isRepeat: true', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/repeat|already asked|same question/);
    expect(result).toContain('isRepeat');
  });

  it('does NOT instruct AI to steer the conversation', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // Should not instruct the AI to guide the user or take initiative
    expect(lower).not.toMatch(/steer.*conversation|guide the user to|take initiative|raise.*topic/);
  });

  it('hint field describes questions the user could ask next (not the AI response direction)', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // The hint should describe what the USER could ask next
    expect(lower).toMatch(/hint.*user.*ask|hint.*question.*user|user.*ask.*next|suggest.*question/);
  });

  it('instructs AI to answer the phone professionally in French to start', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/answer the phone|greeting|professional.*french|bonjour|opening/);
  });

  it('does NOT contain instructions to be a skeptical friend or raise objections', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).not.toMatch(/skeptic|raise objection|persuad/);
  });
});
