import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationHistory } from '../components/ConversationHistory';
import type { Message } from '../types';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('ConversationHistory · regenerate response', () => {
  const messages: Message[] = [
    { role: 'user', text: 'Bonjour', timestamp: 1 },
    {
      role: 'model',
      text: 'Bonjour ! Comment ça va?',
      timestamp: 2,
      audioUrl: 'blob:http://localhost/ai-1',
    },
  ];

  it('shows Regenerate on the regeneratable model bubble and invokes the handler', () => {
    const onRegenerate = vi.fn();
    render(
      <ConversationHistory
        messages={messages}
        onClear={vi.fn()}
        playbackSpeed={1}
        regeneratableMessageTimestamp={2}
        onRegenerateResponse={onRegenerate}
      />
    );

    const button = screen.getByRole('button', { name: /regenerate/i });
    fireEvent.click(button);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('does not show Regenerate when no regeneratable timestamp is provided', () => {
    render(
      <ConversationHistory
        messages={messages}
        onClear={vi.fn()}
        playbackSpeed={1}
      />
    );

    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull();
  });

  it('shows regenerating label while in progress', () => {
    render(
      <ConversationHistory
        messages={messages}
        onClear={vi.fn()}
        playbackSpeed={1}
        regeneratableMessageTimestamp={2}
        onRegenerateResponse={vi.fn()}
        isRegenerating
      />
    );

    expect(screen.getByRole('button', { name: /regenerating/i })).toBeDisabled();
  });
});
