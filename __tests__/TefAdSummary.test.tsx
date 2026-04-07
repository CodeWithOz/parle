/**
 * TDD tests for the TefAdSummary component (components/TefAdSummary.tsx).
 *
 * TefAdSummary is the post-exercise review screen shown after the TEF Ad Persuasion
 * exercise. It displays session statistics (time used, turn count, criteria scorecard,
 * ad thumbnail) and embeds a TefReviewPanel for the AI-generated feedback.
 *
 * Props:
 *   elapsedSeconds: number
 *   turnCount: number
 *   adImage: string | null
 *   reviews: TefReview[]
 *   reviewIndex: number
 *   onNavigateReview: (i: number) => void
 *   isReviewLoading: boolean
 *   reviewError: string | null
 *   onRetryReview: () => void
 *   onRegenerateReview: () => void
 *   onDismiss: () => void
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TefAdSummary } from '../components/TefAdSummary';
import type { TefReview, TefCriterionEvaluation } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_CRITERIA: TefCriterionEvaluation[] = [
  { criterion: 'Used persuasive language', met: true,  evidence: 'Said "vous allez adorer"' },
  { criterion: 'Addressed price concern',  met: false, evidence: 'Did not mention the discount' },
];

const SAMPLE_REVIEW: TefReview = {
  cefrLevel: 'B2',
  cefrJustification: 'Good overall performance.',
  wentWell: ['Strong argumentation'],
  mistakes: [],
  vocabularySuggestions: [],
};

const REVIEW_WITH_CRITERIA: TefReview = {
  ...SAMPLE_REVIEW,
  criteriaEvaluation: SAMPLE_CRITERIA,
};

const FAKE_AD_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function renderSummary(overrides: {
  elapsedSeconds?: number;
  turnCount?: number;
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
    turnCount: 5,
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
// Turn count display
// ---------------------------------------------------------------------------

describe('TefAdSummary · turn count display', () => {
  it('shows a "Turns" stat row', () => {
    renderSummary({ turnCount: 7 });
    expect(screen.getByText(/turns/i)).toBeInTheDocument();
  });

  it('displays the turnCount value in the stats section', () => {
    renderSummary({ turnCount: 7 });
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Criteria scorecard
// ---------------------------------------------------------------------------

describe('TefAdSummary · criteria scorecard', () => {
  it('renders the scorecard when criteriaEvaluation is present with items', () => {
    renderSummary({ reviews: [REVIEW_WITH_CRITERIA], reviewIndex: 0 });
    // Both criterion names should appear
    expect(screen.getByText('Used persuasive language')).toBeInTheDocument();
    expect(screen.getByText('Addressed price concern')).toBeInTheDocument();
  });

  it('shows a checkmark indicator (✓) for a criterion with met: true', () => {
    renderSummary({ reviews: [REVIEW_WITH_CRITERIA], reviewIndex: 0 });
    const checkmarks = screen.getAllByText('✓');
    expect(checkmarks.length).toBeGreaterThanOrEqual(1);
  });

  it('shows a cross indicator (✗) for a criterion with met: false', () => {
    renderSummary({ reviews: [REVIEW_WITH_CRITERIA], reviewIndex: 0 });
    const crosses = screen.getAllByText('✗');
    expect(crosses.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the evidence text for each criterion', () => {
    renderSummary({ reviews: [REVIEW_WITH_CRITERIA], reviewIndex: 0 });
    expect(screen.getByText('Said "vous allez adorer"')).toBeInTheDocument();
    expect(screen.getByText('Did not mention the discount')).toBeInTheDocument();
  });

  it('does not render the scorecard when criteriaEvaluation is absent', () => {
    renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0 });
    expect(screen.queryByText('Used persuasive language')).not.toBeInTheDocument();
  });

  it('does not crash when reviews array is empty (no criteriaEvaluation)', () => {
    expect(() => renderSummary({ reviews: [], reviewIndex: 0 })).not.toThrow();
  });

  it('does not render the scorecard when criteriaEvaluation is an empty array', () => {
    const reviewEmptyCriteria: TefReview = { ...SAMPLE_REVIEW, criteriaEvaluation: [] };
    renderSummary({ reviews: [reviewEmptyCriteria], reviewIndex: 0 });
    // No criterion rows present
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
    expect(screen.queryByText('✗')).not.toBeInTheDocument();
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
