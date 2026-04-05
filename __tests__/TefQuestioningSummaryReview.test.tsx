/**
 * TDD tests for the augmented TefQuestioningSummary component.
 *
 * The existing TefQuestioningSummary component shows time used, questions asked,
 * and repeats flagged. This test file covers the new review integration: the
 * component now accepts additional props and renders a TefReviewPanel below the
 * existing stats.
 *
 * New props added to TefQuestioningSummary:
 *   reviews: TefReview[]
 *   reviewIndex: number
 *   onNavigateReview: (i: number) => void
 *   isReviewLoading: boolean
 *   reviewError: string | null
 *   onRetryReview: () => void
 *   onRegenerateReview: () => void
 *
 * Existing props remain:
 *   questionCount: number
 *   questionGoal?: number
 *   repeatCount: number
 *   elapsedSeconds: number
 *   adImage: string | null
 *   onDismiss: () => void
 *
 * Tests FAIL before the augmented implementation exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TefQuestioningSummary } from '../components/TefQuestioningSummary';
import type { TefReview } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REVIEW: TefReview = {
  cefrLevel: 'B2',
  cefrJustification: 'Solid performance with room for improvement.',
  wentWell: ['Consistent question structure'],
  mistakes: [
    {
      original: 'Est-ce que vous avez',
      correction: 'Avez-vous',
      explanation: 'Inversion is more natural in formal registers.',
    },
  ],
  vocabularySuggestions: [
    {
      used: 'grand',
      better: 'considérable',
      reason: '"Considérable" is more precise in academic or formal contexts.',
    },
  ],
  tipsForC1: ['Use inversion more frequently', 'Expand idiomatic expressions'],
};

const FAKE_AD_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal required props covering both old and new interface
function renderSummary(overrides: {
  questionCount?: number;
  questionGoal?: number;
  repeatCount?: number;
  elapsedSeconds?: number;
  adImage?: string | null;
  onDismiss?: () => void;
  reviews?: TefReview[];
  reviewIndex?: number;
  onNavigateReview?: (i: number) => void;
  isReviewLoading?: boolean;
  reviewError?: string | null;
  onRetryReview?: () => void;
  onRegenerateReview?: () => void;
} = {}) {
  const props = {
    questionCount: 8,
    questionGoal: 10,
    repeatCount: 1,
    elapsedSeconds: 300,
    adImage: null,
    onDismiss: vi.fn(),
    reviews: [],
    reviewIndex: 0,
    onNavigateReview: vi.fn(),
    isReviewLoading: false,
    reviewError: null,
    onRetryReview: vi.fn(),
    onRegenerateReview: vi.fn(),
    ...overrides,
  };
  return render(<TefQuestioningSummary {...props} />);
}

// ---------------------------------------------------------------------------
// Existing stats still render (regression guard)
// ---------------------------------------------------------------------------

describe('TefQuestioningSummary · existing stats (regression)', () => {
  it('renders "Session Complete" heading', () => {
    renderSummary();
    expect(screen.getByText(/session complete/i)).toBeInTheDocument();
  });

  it('renders time used formatted as MM:SS', () => {
    renderSummary({ elapsedSeconds: 300 }); // 5 minutes
    expect(screen.getByText('05:00')).toBeInTheDocument();
  });

  it('renders questions asked count', () => {
    renderSummary({ questionCount: 7, questionGoal: 10 });
    expect(screen.getByText(/7\s*\/\s*10|7 of 10/i)).toBeInTheDocument();
  });

  it('renders repeats flagged count', () => {
    renderSummary({ repeatCount: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders the ad thumbnail when adImage is provided', () => {
    renderSummary({ adImage: FAKE_AD_IMAGE });
    const img = screen.getByRole('img', { name: /advertisement/i });
    expect(img).toBeInTheDocument();
  });

  it('renders a "Done" button', () => {
    renderSummary();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('calls onDismiss when "Done" is clicked', () => {
    const onDismiss = vi.fn();
    renderSummary({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TefReviewPanel integration
// ---------------------------------------------------------------------------

describe('TefQuestioningSummary · TefReviewPanel integration', () => {
  it('renders the review panel loading state when isReviewLoading=true', () => {
    renderSummary({ isReviewLoading: true, reviews: [] });
    expect(screen.getByText(/generating your review/i)).toBeInTheDocument();
  });

  it('existing stats remain visible while review is loading', () => {
    renderSummary({ isReviewLoading: true, reviews: [], elapsedSeconds: 300 });
    // Stats should not disappear just because the review is loading
    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText(/questions asked/i)).toBeInTheDocument();
  });

  it('renders the review panel error state when reviewError is set', () => {
    renderSummary({ reviewError: 'Review generation failed', reviews: [] });
    expect(screen.getByText(/review generation failed/i)).toBeInTheDocument();
  });

  it('renders "Try Again" button in the review error state', () => {
    renderSummary({ reviewError: 'Review generation failed', reviews: [] });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls onRetryReview when the review "Try Again" button is clicked', () => {
    const onRetryReview = vi.fn();
    renderSummary({ reviewError: 'Failed', reviews: [], onRetryReview });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetryReview).toHaveBeenCalledTimes(1);
  });

  it('renders review CEFR content when reviews array is non-empty', () => {
    renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0 });
    expect(screen.getByText('B2')).toBeInTheDocument();
  });

  it('existing stats still visible when review content is shown', () => {
    renderSummary({
      reviews: [SAMPLE_REVIEW],
      reviewIndex: 0,
      elapsedSeconds: 300,
      questionCount: 8,
    });
    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText('B2')).toBeInTheDocument();
  });

  it('renders regenerate button when review is available', () => {
    renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0 });
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
  });

  it('calls onRegenerateReview when regenerate button is clicked', () => {
    const onRegenerateReview = vi.fn();
    renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0, onRegenerateReview });
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onRegenerateReview).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigateReview when carousel navigation is used', () => {
    const SECOND_REVIEW: TefReview = {
      cefrLevel: 'C1',
      cefrJustification: 'Near-native fluency.',
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
// Container sizing (smoke test for CSS class presence)
// ---------------------------------------------------------------------------

describe('TefQuestioningSummary · container sizing', () => {
  it('uses a wider max-width container (max-w-lg or larger) to accommodate the review panel', () => {
    const { container } = renderSummary({ reviews: [SAMPLE_REVIEW], reviewIndex: 0 });
    // The inner panel element must be wider than max-w-sm
    // We look for a class that is NOT max-w-sm (which was the previous default)
    const innerPanel = container.querySelector('[class*="max-w-"]');
    expect(innerPanel).not.toBeNull();
    expect(innerPanel!.className).not.toMatch(/\bmax-w-sm\b/);
  });
});
