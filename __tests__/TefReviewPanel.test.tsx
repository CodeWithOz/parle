/**
 * TDD tests for the TefReviewPanel component (components/TefReviewPanel.tsx).
 *
 * TefReviewPanel is a shared component that renders the AI-generated post-exercise
 * review. It supports loading, error, and populated states, plus optional carousel
 * navigation when multiple reviews are available.
 *
 * Props:
 *   reviews: TefReview[]
 *   currentIndex: number
 *   onNavigate: (i: number) => void
 *   isLoading: boolean
 *   error: string | null
 *   onRetry: () => void
 *   onRegenerate: () => void
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TefReviewPanel } from '../components/TefReviewPanel';
import type { TefReview } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REVIEW: TefReview = {
  cefrLevel: 'B2',
  cefrJustification: 'Good command of grammar with some inaccuracies.',
  wentWell: ['Clear pronunciation', 'Good use of transition words'],
  mistakes: [
    {
      original: 'je suis parti hier',
      correction: 'hier matin, je suis parti',
      explanation: 'Adding a time qualifier clarifies when the departure happened.',
    },
  ],
  vocabularySuggestions: [
    {
      used: 'beaucoup',
      better: 'considérablement',
      reason: 'This word is more formal and appropriate for C1 level.',
    },
  ],
  tipsForC1: ['Use more subordinate clauses', 'Vary your sentence lengths'],
};

const SECOND_REVIEW: TefReview = {
  cefrLevel: 'C1',
  cefrJustification: 'Excellent fluency with minor errors.',
  wentWell: ['Strong argumentation', 'Complex sentence structures'],
  mistakes: [],
  vocabularySuggestions: [],
  tipsForC1: ['Continue practising idiomatic expressions'],
};

function renderPanel(overrides: {
  reviews?: TefReview[];
  currentIndex?: number;
  onNavigate?: (i: number) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRegenerate?: () => void;
}) {
  const props = {
    reviews: [],
    currentIndex: 0,
    onNavigate: vi.fn(),
    isLoading: false,
    error: null,
    onRetry: vi.fn(),
    onRegenerate: vi.fn(),
    ...overrides,
  };
  return render(<TefReviewPanel {...props} />);
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('TefReviewPanel · loading state', () => {
  it('renders a loading indicator when isLoading=true and no reviews', () => {
    renderPanel({ isLoading: true, reviews: [] });
    // A skeleton or spinner element should be present
    const loadingEl =
      screen.queryByText(/generating your review/i) ||
      document.querySelector('[class*="animate-pulse"]') ||
      document.querySelector('[class*="skeleton"]') ||
      screen.queryByRole('status');
    expect(loadingEl).toBeInTheDocument();
  });

  it('renders "Generating your review..." text when isLoading=true and no reviews', () => {
    renderPanel({ isLoading: true, reviews: [] });
    expect(screen.getByText(/generating your review/i)).toBeInTheDocument();
  });

  it('does not render CEFR badge content when in pure loading state (no reviews)', () => {
    renderPanel({ isLoading: true, reviews: [] });
    expect(screen.queryByText('B2')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('TefReviewPanel · error state', () => {
  it('renders an error message when error is set', () => {
    renderPanel({ error: 'Something went wrong. Please try again.', reviews: [] });
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders a "Try Again" button when error is set', () => {
    renderPanel({ error: 'Network error', reviews: [] });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls onRetry when "Try Again" is clicked', () => {
    const onRetry = vi.fn();
    renderPanel({ error: 'Network error', reviews: [], onRetry });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render review content when in error state', () => {
    renderPanel({ error: 'Some error', reviews: [] });
    expect(screen.queryByText(/went well/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mistakes/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Review content rendering
// ---------------------------------------------------------------------------

describe('TefReviewPanel · review content', () => {
  it('renders the CEFR level badge', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText('B2')).toBeInTheDocument();
  });

  it('renders the CEFR justification text', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(
      screen.getByText(/Good command of grammar with some inaccuracies/i)
    ).toBeInTheDocument();
  });

  it('renders a "What Went Well" section heading', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/went well/i)).toBeInTheDocument();
  });

  it('renders each wentWell item', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/Clear pronunciation/i)).toBeInTheDocument();
    expect(screen.getByText(/Good use of transition words/i)).toBeInTheDocument();
  });

  it('renders a "Mistakes" section', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/mistakes/i)).toBeInTheDocument();
  });

  it('renders mistake original text', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/je suis parti hier/i)).toBeInTheDocument();
  });

  it('renders mistake correction text', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/hier matin, je suis parti/i)).toBeInTheDocument();
  });

  it('renders mistake explanation', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/Adding a time qualifier/i)).toBeInTheDocument();
  });

  it('renders a vocabulary suggestions section', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/vocabulary/i)).toBeInTheDocument();
  });

  it('renders vocabulary suggestion "used" term', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/beaucoup/i)).toBeInTheDocument();
  });

  it('renders vocabulary suggestion "better" term', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/considérablement/i)).toBeInTheDocument();
  });

  it('renders a "Tips for C1" section', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/tips for c1/i)).toBeInTheDocument();
  });

  it('renders each tipsForC1 item', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/Use more subordinate clauses/i)).toBeInTheDocument();
    expect(screen.getByText(/Vary your sentence lengths/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Carousel: navigation controls
// ---------------------------------------------------------------------------

describe('TefReviewPanel · carousel navigation', () => {
  it('does not show navigation controls when there is only one review', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.queryByText(/review 1 of 1/i)).not.toBeInTheDocument();
    // No prev/next buttons expected for a single review
    expect(screen.queryByRole('button', { name: /previous|←|prev/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next|→/i })).not.toBeInTheDocument();
  });

  it('shows "Review X of Y" label when multiple reviews exist', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 0 });
    expect(screen.getByText(/review 1 of 2/i)).toBeInTheDocument();
  });

  it('updates "Review X of Y" label based on currentIndex', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 1 });
    expect(screen.getByText(/review 2 of 2/i)).toBeInTheDocument();
  });

  it('renders prev and next navigation buttons when multiple reviews exist', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 0 });
    // There should be some previous/back button and a next button
    const prevBtn = screen.getByRole('button', { name: /previous|←|prev/i });
    const nextBtn = screen.getByRole('button', { name: /next|→/i });
    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();
  });

  it('disables the previous button at index 0', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 0 });
    const prevBtn = screen.getByRole('button', { name: /previous|←|prev/i });
    expect(prevBtn).toBeDisabled();
  });

  it('disables the next button at the last index', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 1 });
    const nextBtn = screen.getByRole('button', { name: /next|→/i });
    expect(nextBtn).toBeDisabled();
  });

  it('enables the next button when not at the last index', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 0 });
    const nextBtn = screen.getByRole('button', { name: /next|→/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it('enables the previous button when not at index 0', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 1 });
    const prevBtn = screen.getByRole('button', { name: /previous|←|prev/i });
    expect(prevBtn).not.toBeDisabled();
  });

  it('calls onNavigate with index+1 when next button is clicked', () => {
    const onNavigate = vi.fn();
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 0, onNavigate });
    fireEvent.click(screen.getByRole('button', { name: /next|→/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('calls onNavigate with index-1 when previous button is clicked', () => {
    const onNavigate = vi.fn();
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 1, onNavigate });
    fireEvent.click(screen.getByRole('button', { name: /previous|←|prev/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('displays the review at currentIndex (first review at index 0)', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 0 });
    expect(screen.getByText('B2')).toBeInTheDocument();
    expect(screen.queryByText('C1')).not.toBeInTheDocument();
  });

  it('displays the review at currentIndex (second review at index 1)', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW, SECOND_REVIEW], currentIndex: 1 });
    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.queryByText('B2')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Regenerate button
// ---------------------------------------------------------------------------

describe('TefReviewPanel · regenerate button', () => {
  it('renders a regenerate button when review content is available', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0 });
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('calls onRegenerate when the regenerate button is clicked', () => {
    const onRegenerate = vi.fn();
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0, onRegenerate });
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('disables the regenerate button while isLoading=true', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0, isLoading: true });
    const regenBtn = screen.getByRole('button', { name: /regenerate/i });
    expect(regenBtn).toBeDisabled();
  });

  it('enables the regenerate button when not loading', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0, isLoading: false });
    const regenBtn = screen.getByRole('button', { name: /regenerate/i });
    expect(regenBtn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Regenerating state: existing content stays visible while loading
// ---------------------------------------------------------------------------

describe('TefReviewPanel · regenerating with existing reviews', () => {
  it('shows existing review content while isLoading=true when reviews are already available', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0, isLoading: true });
    // The existing review content should still be visible (not replaced by skeleton)
    expect(screen.getByText('B2')).toBeInTheDocument();
  });

  it('keeps CEFR justification visible during regeneration', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0, isLoading: true });
    expect(
      screen.getByText(/Good command of grammar with some inaccuracies/i)
    ).toBeInTheDocument();
  });

  it('does not show "Generating your review..." when regenerating over existing content', () => {
    renderPanel({ reviews: [SAMPLE_REVIEW], currentIndex: 0, isLoading: true });
    // The pure loading message should not appear when there is already content
    expect(screen.queryByText(/generating your review/i)).not.toBeInTheDocument();
  });
});
