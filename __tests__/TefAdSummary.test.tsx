/**
 * TDD tests for the TefAdSummary component (components/TefAdSummary.tsx).
 *
 * TefAdSummary is the post-exercise review screen shown after the TEF Ad Persuasion
 * exercise. It displays session statistics (time used, directions addressed, convinced
 * status, ad thumbnail) and embeds a TefReviewPanel for the AI-generated feedback.
 *
 * Props:
 *   elapsedSeconds: number
 *   objectionState: TefObjectionState | null
 *   adImage: string | null
 *   reviews: TefReview[]
 *   reviewIndex: number
 *   onNavigateReview: (i: number) => void
 *   isReviewLoading: boolean
 *   reviewError: string | null
 *   onRetryReview: () => void
 *   onRegenerateReview: () => void
 *   onDismiss: () => void
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TefAdSummary } from '../components/TefAdSummary';
import type { TefReview, TefObjectionState } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REVIEW: TefReview = {
  cefrLevel: 'B2',
  cefrJustification: 'Good overall performance.',
  wentWell: ['Strong argumentation'],
  mistakes: [],
  vocabularySuggestions: [],
  tipsForC1: ['Use more complex structures'],
};

const SAMPLE_OBJECTION_STATE: TefObjectionState = {
  directions: ['Price', 'Quality', 'Availability', 'Sustainability', 'Brand trust'],
  currentDirection: 4,
  currentRound: 2,
  isConvinced: true,
};

const NOT_CONVINCED_STATE: TefObjectionState = {
  directions: ['Price', 'Quality', 'Availability', 'Sustainability', 'Brand trust'],
  currentDirection: 2,
  currentRound: 1,
  isConvinced: false,
};

const FAKE_AD_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function renderSummary(overrides: {
  elapsedSeconds?: number;
  objectionState?: TefObjectionState | null;
  adImage?: string | null;
  reviews?: TefReview[];
  reviewIndex?: number;
  onNavigateReview?: (i: number) => void;
  isReviewLoading?: boolean;
  reviewError?: string | null;
  onRetryReview?: () => void;
  onRegenerateReview?: () => void;
  onDismiss?: () => void;
} = {}) {
  const props = {
    elapsedSeconds: 180,
    objectionState: SAMPLE_OBJECTION_STATE,
    adImage: null,
    reviews: [],
    reviewIndex: 0,
    onNavigateReview: vi.fn(),
    isReviewLoading: false,
    reviewError: null,
    onRetryReview: vi.fn(),
    onRegenerateReview: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  return render(<TefAdSummary {...props} />);
}

// ---------------------------------------------------------------------------
// Heading / structure
// ---------------------------------------------------------------------------

describe('TefAdSummary · heading', () => {
  it('renders a "Session Complete" heading', () => {
    renderSummary();
    expect(screen.getByText(/session complete/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Time display
// ---------------------------------------------------------------------------

describe('TefAdSummary · time used', () => {
  it('shows time formatted as MM:SS', () => {
    renderSummary({ elapsedSeconds: 183 }); // 3 minutes 3 seconds
    expect(screen.getByText('03:03')).toBeInTheDocument();
  });

  it('shows "00:00" when elapsedSeconds is 0', () => {
    renderSummary({ elapsedSeconds: 0 });
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('correctly formats exactly 60 seconds as "01:00"', () => {
    renderSummary({ elapsedSeconds: 60 });
    expect(screen.getByText('01:00')).toBeInTheDocument();
  });

  it('renders a label indicating "Time used" or equivalent', () => {
    renderSummary();
    expect(screen.getByText(/time used/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Directions addressed
// ---------------------------------------------------------------------------

describe('TefAdSummary · directions addressed', () => {
  it('shows directions addressed count based on objectionState', () => {
    // currentDirection=4 with isConvinced=true means all 5 were addressed
    renderSummary({ objectionState: SAMPLE_OBJECTION_STATE });
    expect(screen.getByText(/5\s*\/\s*5|5 of 5/i)).toBeInTheDocument();
  });

  it('shows partial directions addressed when not all were reached', () => {
    // currentDirection=2 means 3 directions addressed (0,1,2)
    renderSummary({ objectionState: NOT_CONVINCED_STATE });
    expect(screen.getByText(/3\s*\/\s*5|3 of 5/i)).toBeInTheDocument();
  });

  it('renders a label indicating directions addressed', () => {
    renderSummary();
    expect(screen.getByText(/directions|objection/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Convinced status
// ---------------------------------------------------------------------------

describe('TefAdSummary · convinced status', () => {
  it('shows a positive/green indicator when isConvinced=true', () => {
    renderSummary({ objectionState: SAMPLE_OBJECTION_STATE });
    // Look for a checkmark, "yes", "convinced", or a green-class element
    const convincedEl =
      screen.queryByText(/convinced/i) ||
      screen.queryByText(/✓|✔|yes/i) ||
      document.querySelector('.text-green-400') ||
      document.querySelector('[class*="green"]');
    expect(convincedEl).toBeInTheDocument();
  });

  it('shows a negative/red indicator when isConvinced=false', () => {
    renderSummary({ objectionState: NOT_CONVINCED_STATE });
    const notConvincedEl =
      screen.queryByText(/not convinced/i) ||
      screen.queryByText(/✗|✘|no/i) ||
      document.querySelector('.text-red-400') ||
      document.querySelector('[class*="red"]');
    expect(notConvincedEl).toBeInTheDocument();
  });

  it('renders a label for the convinced status row', () => {
    renderSummary();
    expect(screen.getByText(/convinced/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ad thumbnail
// ---------------------------------------------------------------------------

describe('TefAdSummary · ad thumbnail', () => {
  it('renders an ad image when adImage is provided', () => {
    renderSummary({ adImage: FAKE_AD_IMAGE });
    const img = screen.getByRole('img', { name: /advertisement/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', FAKE_AD_IMAGE);
  });

  it('does not render an img element when adImage is null', () => {
    renderSummary({ adImage: null });
    expect(screen.queryByRole('img', { name: /advertisement/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TefReviewPanel integration
// ---------------------------------------------------------------------------

describe('TefAdSummary · TefReviewPanel integration', () => {
  it('renders the review panel loading state when isReviewLoading=true', () => {
    renderSummary({ isReviewLoading: true, reviews: [] });
    expect(screen.getByText(/generating your review/i)).toBeInTheDocument();
  });

  it('renders the review panel error state when reviewError is set', () => {
    renderSummary({ reviewError: 'Could not load review', reviews: [] });
    expect(screen.getByText(/could not load review/i)).toBeInTheDocument();
  });

  it('calls onRetryReview when the review panel "Try Again" button is clicked', () => {
    const onRetryReview = vi.fn();
    renderSummary({ reviewError: 'Error occurred', reviews: [], onRetryReview });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetryReview).toHaveBeenCalledTimes(1);
  });

  it('renders review content (CEFR badge) when reviews are available', () => {
    renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0 });
    expect(screen.getByText('B2')).toBeInTheDocument();
  });

  it('calls onRegenerateReview when the regenerate button is clicked', () => {
    const onRegenerateReview = vi.fn();
    renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0, onRegenerateReview });
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onRegenerateReview).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigateReview with correct index when carousel next is clicked', () => {
    const SECOND_REVIEW: TefReview = {
      cefrLevel: 'C1',
      cefrJustification: 'Excellent.',
      wentWell: [],
      mistakes: [],
      vocabularySuggestions: [],
      tipsForC1: [],
    };
    const onNavigateReview = vi.fn();
    renderSummary({
      reviews: [SAMPLE_REVIEW, SECOND_REVIEW],
      reviewIndex: 0,
      onNavigateReview,
    });
    fireEvent.click(screen.getAllByRole('button', { name: /next|→/i })[0]);
    expect(onNavigateReview).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Done button
// ---------------------------------------------------------------------------

describe('TefAdSummary · Done button', () => {
  it('renders a "Done" button', () => {
    renderSummary();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('calls onDismiss when the "Done" button is clicked', () => {
    const onDismiss = vi.fn();
    renderSummary({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
