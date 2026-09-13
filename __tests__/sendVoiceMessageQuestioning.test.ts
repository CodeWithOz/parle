import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockParleBff } from './helpers/mockParleBff';

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('sendVoiceMessage · isTefQuestioning=true, isRepeat=true in response', () => {
  it('returns VoiceResponse with isRepeat = true', async () => {
    mockParleBff({
      transcription: 'Bonjour, je voudrais savoir le prix.',
      modelJson: {
        french: 'Bonjour, comme je vous ai dit, notre plan coûte 29 euros par mois.',
        english: 'Hello, as I told you, our plan costs 29 euros per month.',
        hint: 'Ask about the installation fee',
        isRepeat: true,
        conceptLabels: ['pricing'],
      },
    });
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');
    setScenario({
      id: 'test-questioning',
      name: 'TEF Questioning',
      description: 'Customer service call practice',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: true,
      characters: [{ id: 'agent', name: 'Agent', role: 'agent', voiceName: 'puck' }],
    });
    await initializeSession();
    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);
    expect(response.isRepeat).toBe(true);
    expect(response.conceptLabels).toEqual(['pricing']);
  });
});

describe('sendVoiceMessage · isTefQuestioning=true, isRepeat=false in response', () => {
  it('returns VoiceResponse with isRepeat = false or undefined (not true)', async () => {
    mockParleBff({
      modelJson: {
        french: 'Bien sûr, nos contrats sont disponibles en 12 ou 24 mois.',
        english: 'Of course, our contracts are available in 12 or 24 months.',
        hint: 'Ask about the cancellation policy',
        isRepeat: false,
        conceptLabels: ['contract duration'],
      },
    });
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');
    setScenario({
      id: 'test-questioning-2',
      name: 'TEF Questioning',
      description: 'Customer service call practice',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: true,
      characters: [{ id: 'agent', name: 'Agent', role: 'agent', voiceName: 'puck' }],
    });
    await initializeSession();
    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);
    expect(response.isRepeat).not.toBe(true);
    expect(response.conceptLabels).toEqual(['contract duration']);
  });
});

describe('sendVoiceMessage · isTefQuestioning falsy, standard single-character path', () => {
  it('does not set isRepeat on VoiceResponse when scenario is a regular TEF Ad scenario', async () => {
    mockParleBff({
      modelJson: {
        french: "Hmm, je ne sais pas... c'est assez cher, non?",
        english: "Hmm, I don't know... it's quite expensive, isn't it?",
        hint: 'Explain the value for money',
      },
    });
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');
    setScenario({
      id: 'test-ad-persuasion',
      name: 'TEF Ad Persuasion',
      description: 'Ad persuasion practice',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    });
    await initializeSession();
    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);
    expect(response.isRepeat).toBeUndefined();
  });

  it('does not set isRepeat when no scenario is active (free conversation mode)', async () => {
    mockParleBff({
      modelJson: {
        french: 'Bonjour! Comment puis-je vous aider?',
        english: 'Hello! How can I help you?',
      },
    });
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');
    setScenario(null);
    await initializeSession();
    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);
    expect(response.isRepeat).toBeUndefined();
  });
});
