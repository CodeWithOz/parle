import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InvisibleInkText } from '../components/InvisibleInkText';
import { TefTopicSuggestionsList } from '../components/TefTopicSuggestionsList';

afterEach(() => {
  vi.useRealTimers();
});

describe('InvisibleInkText', () => {
  it('reveals French text on click and conceals it again after 60 seconds', () => {
    vi.useFakeTimers();
    render(<InvisibleInkText text="Quel est le prix ?" />);

    const ink = screen.getByRole('button', { name: /reveal french text for 60 seconds/i });
    expect(ink).toHaveAttribute('data-state', 'concealed');

    fireEvent.click(ink);
    expect(ink).toHaveAttribute('data-state', 'revealed');
    expect(ink).toHaveAccessibleName(/french text revealed: quel est le prix/i);

    act(() => vi.advanceTimersByTime(59_999));
    expect(ink).toHaveAttribute('data-state', 'revealed');

    act(() => vi.advanceTimersByTime(1));
    expect(ink).toHaveAttribute('data-state', 'concealed');
    expect(ink).toHaveAccessibleName(/reveal french text for 60 seconds/i);
  });

  it('leaves the English translation visible outside the ink control', () => {
    render(
      <TefTopicSuggestionsList
        topicSuggestions={[
          {
            topic: 'Pricing',
            examples: [{ french: 'Quel est le prix ?', english: 'What is the price?' }],
          },
        ]}
      />
    );

    expect(screen.getByText('What is the price?')).toBeVisible();
    expect(screen.getByRole('button', { name: /reveal french text/i })).toHaveAttribute(
      'data-state',
      'concealed'
    );
  });
});
