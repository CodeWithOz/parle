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

  // -----------------------------------------------------------------------
  // Phone-number / already-on-call behaviour
  // -----------------------------------------------------------------------

  it('states that the user is already on the phone call (not someone who needs to be directed to call)', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // Must tell the agent that the caller is ALREADY on the phone, e.g.
    // "the user is already on the phone call", "caller is already calling",
    // "the caller has already called", "already on this call", etc.
    expect(lower).toMatch(
      /already.*on.*the.*call|already.*calling|already.*on.*the.*phone|caller.*already|the user.*already.*call/
    );
  });

  it('explicitly forbids asking the user to call the phone number on the ad', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(
      /do not ask.*to call|do not ask them to call|never.*ask.*to call|do not.*redirect.*phone number|do not.*redirect them to that number/
    );
  });

  it('instructs the agent to invent sensible in-character answers instead of redirecting to the phone number', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    // Must tell the agent to make up / invent plausible details rather than
    // refusing or redirecting — phrasing like "invent", "make up", "create",
    // "plausible details", "realistic answer", "sensible", etc.
    expect(lower).toMatch(
      /invent.*answer|make.*up.*answer|invent.*detail|make.*up.*detail|plausible.*detail|realistic.*answer|sensible.*detail|invent.*plausible|reasonable.*detail|create.*plausible|invent.*plausible|put.*caller.*at ease|reassuring/
    );
  });

  it('prefers simple reassuring answers as the default before any redirect', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/default|first|most questions|majority|without redirecting/);
    expect(lower).toMatch(/at ease|reassuring|simple/);
  });

  it('allows website redirect only as a last resort when the user persists', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/website|site web|site internet/);
    expect(lower).toMatch(/last resort|only when|persist|push/);
  });

  it('allows email redirect only as a last resort when the user persists', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/email|e-mail|courriel/);
    expect(lower).toMatch(/last resort|only when|persist|push|written/);
  });

  it('does not offer website or email redirect on the first question about a topic', () => {
    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    const lower = result.toLowerCase();
    expect(lower).toMatch(/do not offer website|first question|first ask|try a simple/);
  });
});
