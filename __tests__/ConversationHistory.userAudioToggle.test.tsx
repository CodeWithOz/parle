import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationHistory } from '../components/ConversationHistory';
import type { Message } from '../types';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function makeUserMessage(): Message {
  return {
    role: 'user',
    text: 'Je voudrais acheter un billet.',
    timestamp: 1,
    audioUrl: 'blob:http://localhost/user-audio-1',
  };
}

describe('ConversationHistory · user audio toggle', () => {
  it('shows a subtle toggle for user recordings in role-play mode and reveals the audio player when opened', () => {
    const { container } = render(
      <ConversationHistory
        messages={[makeUserMessage()]}
        onClear={vi.fn()}
        playbackSpeed={1}
        showUserAudioToggle
      />
    );

    expect(screen.getByRole('button', { name: /show recording/i })).toBeInTheDocument();
    expect(container.querySelector('audio')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /show recording/i }));

    expect(screen.getByRole('button', { name: /hide recording/i })).toBeInTheDocument();
    expect(container.querySelector('audio')).not.toBeNull();
  });

  it('does not show the toggle outside role-play mode', () => {
    render(
      <ConversationHistory
        messages={[makeUserMessage()]}
        onClear={vi.fn()}
        playbackSpeed={1}
        showUserAudioToggle={false}
      />
    );

    expect(screen.queryByRole('button', { name: /show recording/i })).toBeNull();
  });
});
