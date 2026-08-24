import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message, VoiceResponse } from '../types';
import {
  findLastAssistantTurn,
  isTimestampInLastAssistantTurn,
  persuasionPhaseTurnNumber,
  buildPersuasionPhaseContext,
  nextRepeatCountAfterRegenerate,
  replaceLastAssistantTurnMessages,
} from '../utils/regenerateLastResponse';

describe('regenerateLastResponse helpers', () => {
  describe('findLastAssistantTurn', () => {
    it('returns null when there is no trailing model turn', () => {
      expect(findLastAssistantTurn([])).toBeNull();
      expect(
        findLastAssistantTurn([{ role: 'user', text: 'hi', timestamp: 1 }])
      ).toBeNull();
    });

    it('finds a single-character last turn', () => {
      const messages: Message[] = [
        { role: 'user', text: 'a', timestamp: 1 },
        { role: 'model', text: 'b', timestamp: 2 },
        { role: 'user', text: 'c', timestamp: 3 },
        { role: 'model', text: 'd', timestamp: 4 },
      ];
      expect(findLastAssistantTurn(messages)).toEqual({
        lastUserIndex: 2,
        modelStartIndex: 3,
        modelEndIndex: 3,
      });
    });

    it('finds a multi-character last turn', () => {
      const messages: Message[] = [
        { role: 'user', text: 'a', timestamp: 1 },
        { role: 'model', text: 'b', timestamp: 2, characterName: 'Baker' },
        { role: 'model', text: 'c', timestamp: 3, characterName: 'Cashier' },
      ];
      expect(findLastAssistantTurn(messages)).toEqual({
        lastUserIndex: 0,
        modelStartIndex: 1,
        modelEndIndex: 2,
      });
    });
  });

  describe('isTimestampInLastAssistantTurn', () => {
    it('is true only for model bubbles in the last turn', () => {
      const messages: Message[] = [
        { role: 'user', text: 'a', timestamp: 1 },
        { role: 'model', text: 'b', timestamp: 2 },
        { role: 'user', text: 'c', timestamp: 3 },
        { role: 'model', text: 'd', timestamp: 4 },
        { role: 'model', text: 'e', timestamp: 5 },
      ];
      expect(isTimestampInLastAssistantTurn(messages, 2)).toBe(false);
      expect(isTimestampInLastAssistantTurn(messages, 4)).toBe(true);
      expect(isTimestampInLastAssistantTurn(messages, 5)).toBe(true);
      expect(isTimestampInLastAssistantTurn(messages, 3)).toBe(false);
    });
  });

  describe('persuasionPhaseTurnNumber', () => {
    it('uses count+1 for a new turn and count for regenerate', () => {
      expect(persuasionPhaseTurnNumber(2, false)).toBe(3);
      expect(persuasionPhaseTurnNumber(3, true)).toBe(3);
      expect(persuasionPhaseTurnNumber(0, true)).toBe(0);
    });
  });

  describe('buildPersuasionPhaseContext', () => {
    it('returns undefined for greeting / non-positive turns', () => {
      expect(buildPersuasionPhaseContext(0)).toBeUndefined();
    });

    it('returns early / mid / late coaching text', () => {
      expect(buildPersuasionPhaseContext(1)).toContain('introduce and present');
      expect(buildPersuasionPhaseContext(3)).toContain('exemple concret');
      expect(buildPersuasionPhaseContext(5)).toContain('counter-argument');
    });
  });

  describe('nextRepeatCountAfterRegenerate', () => {
    it('adjusts when isRepeat flips', () => {
      expect(nextRepeatCountAfterRegenerate(1, true, false)).toBe(0);
      expect(nextRepeatCountAfterRegenerate(0, false, true)).toBe(1);
      expect(nextRepeatCountAfterRegenerate(2, true, true)).toBe(2);
      expect(nextRepeatCountAfterRegenerate(1, false, false)).toBe(1);
    });
  });

  describe('replaceLastAssistantTurnMessages', () => {
    let revokeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
      revokeSpy.mockRestore();
    });

    it('replaces the last model bubble and keeps the user recording URL', () => {
      const messages: Message[] = [
        {
          role: 'user',
          text: 'Bonjour',
          timestamp: 1,
          audioUrl: 'blob:http://localhost/user-1',
        },
        {
          role: 'model',
          text: 'Old reply',
          timestamp: 2,
          audioUrl: 'blob:http://localhost/old-ai',
        },
      ];

      const response: VoiceResponse = {
        audioUrl: 'blob:http://localhost/new-ai',
        userText: 'Bonjour',
        modelText: 'New reply English',
        voiceName: 'aoede',
        characters: [
          {
            characterId: 'c1',
            characterName: 'Agent',
            voiceName: 'aoede',
            frenchText: 'New reply',
          },
        ],
      };

      const { messages: next, autoPlayMessageId } = replaceLastAssistantTurnMessages(
        messages,
        response,
        { baseTimestamp: 1000 }
      );
      expect(next).toHaveLength(2);
      expect(next[0].audioUrl).toBe('blob:http://localhost/user-1');
      expect(next[0].text).toBe('Bonjour');
      expect(next[1].text).toBe('New reply English');
      expect(next[1].audioUrl).toBe('blob:http://localhost/new-ai');
      expect(next[1].timestamp).toBe(1001);
      expect(autoPlayMessageId).toBe(1001);
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/old-ai');
    });

    it('updates TEF questioning metadata on the user message when not greeting', () => {
      const messages: Message[] = [
        {
          role: 'user',
          text: 'Quel est le prix?',
          timestamp: 1,
          isRepeat: false,
          conceptLabels: ['pricing'],
        },
        { role: 'model', text: 'old', timestamp: 2, audioUrl: '' },
      ];

      const response: VoiceResponse = {
        audioUrl: '',
        userText: 'Quel est le prix?',
        modelText: 'new',
        isRepeat: true,
        conceptLabels: ['cost'],
        characters: [
          {
            characterId: '',
            characterName: '',
            voiceName: 'aoede',
          },
        ],
      };

      const { messages: next } = replaceLastAssistantTurnMessages(messages, response, {
        tefQuestioningUpdate: { isPractice: true, skipFirstMessageMeta: false },
      });
      expect(next[0].isRepeat).toBe(true);
      expect(next[0].conceptLabels).toEqual(['cost']);
    });
  });
});
