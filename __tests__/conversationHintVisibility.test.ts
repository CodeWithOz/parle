import { describe, it, expect } from 'vitest';
import { AppState } from '../types';
import {
  isConversationHintVisible,
  shouldSetHintFromResponse,
} from '../utils/conversationHintVisibility';

describe('shouldSetHintFromResponse', () => {
  it('returns true for role-play practice with a hint', () => {
    expect(shouldSetHintFromResponse('practice', 'Try asking about price')).toBe(true);
  });

  it('returns false when scenario mode is not practice', () => {
    expect(shouldSetHintFromResponse('setup', 'hint')).toBe(false);
  });

  it('returns false when hint is empty', () => {
    expect(shouldSetHintFromResponse('practice', '')).toBe(false);
    expect(shouldSetHintFromResponse('practice', null)).toBe(false);
    expect(shouldSetHintFromResponse('practice', undefined)).toBe(false);
  });
});

describe('isConversationHintVisible', () => {
  it('is visible only during role-play practice in IDLE or RECORDING', () => {
    expect(isConversationHintVisible('practice', AppState.IDLE)).toBe(true);
    expect(isConversationHintVisible('practice', AppState.RECORDING)).toBe(true);
  });

  it('is hidden during processing and error states', () => {
    expect(isConversationHintVisible('practice', AppState.PROCESSING)).toBe(false);
    expect(isConversationHintVisible('practice', AppState.ERROR)).toBe(false);
  });

  it('is hidden outside role-play practice (TEF modes use practice guide instead)', () => {
    expect(isConversationHintVisible('none', AppState.IDLE)).toBe(false);
    expect(isConversationHintVisible('setup', AppState.RECORDING)).toBe(false);
  });
});
