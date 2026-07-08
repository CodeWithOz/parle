import React from 'react';
import type { TefReview } from '../types';
import { TefTopicSuggestionsList } from './TefTopicSuggestionsList';

interface TefReviewPanelProps {
  reviews: TefReview[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onRegenerate: () => void;
}

export const TefReviewPanel: React.FC<TefReviewPanelProps> = ({
  reviews,
  currentIndex,
  onNavigate,
  isLoading,
  error,
  onRetry,
  onRegenerate,
}) => {
  const hasReviews = reviews.length > 0;
  const currentReview = hasReviews ? reviews[currentIndex] : null;

  // Pure loading state — no existing reviews yet
  if (isLoading && !hasReviews) {
    return (
      <div className="mt-6 text-left space-y-5" role="status">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-parle-navy-100 rounded w-3/4" />
          <div className="h-4 bg-parle-navy-100 rounded w-1/2" />
          <div className="h-4 bg-parle-navy-100 rounded w-2/3" />
        </div>
        <p className="text-parle-navy-500 text-sm text-center">Generating your review...</p>
      </div>
    );
  }

  // Error state (not loading)
  if (error !== null && !isLoading) {
    return (
      <div className="mt-6 text-left space-y-5">
        <div className="bg-parle-red-50 border border-parle-red-300 rounded-xl p-4">
          <p className="text-parle-red-700 text-sm">{error}</p>
          <button
            onClick={onRetry}
            className="mt-3 px-4 py-2 bg-parle-red-500 hover:bg-parle-red-600 text-white text-sm rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No reviews and not loading — nothing to show
  if (!currentReview) {
    return null;
  }

  // Content state (with or without loading overlay for regeneration)
  return (
    <div className="mt-6 text-left space-y-5">
      {/* Carousel controls */}
      {reviews.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            aria-label="Previous review"
            className="text-parle-navy-300 hover:text-parle-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-lg px-2"
          >
            ←
          </button>
          <span className="text-parle-navy-500 text-xs">
            Review {currentIndex + 1} of {reviews.length}
          </span>
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === reviews.length - 1}
            aria-label="Next review"
            className="text-parle-navy-300 hover:text-parle-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-lg px-2"
          >
            →
          </button>
        </div>
      )}

      {/* CEFR badge */}
      <div>
        <div className="flex justify-center">
          <span className="inline-block bg-parle-blue-100 text-parle-blue-700 border border-parle-blue-300 rounded-full px-3 py-1 text-sm font-bold">
            {currentReview.cefrLevel}
          </span>
        </div>
        <p className="text-parle-navy-500 text-sm text-center mt-2">{currentReview.cefrJustification}</p>
      </div>

      {/* What Went Well */}
      <div>
        <h3 className="text-parle-blue-600 font-semibold text-sm mb-2">What Went Well</h3>
        <ul className="space-y-1">
          {currentReview.wentWell.map((item, i) => (
            <li key={i} className="text-parle-navy-700 text-sm flex gap-2">
              <span className="text-parle-blue-500">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Mistakes */}
      <div>
        <h3 className="text-parle-red-600 font-semibold text-sm mb-2">Mistakes</h3>
        {currentReview.mistakes.length === 0 ? (
          <p className="text-parle-navy-500 text-sm">No significant mistakes noted.</p>
        ) : (
          <div className="space-y-2">
            {currentReview.mistakes.map((mistake, i) => (
              <div
                key={i}
                className="bg-parle-blue-50 rounded-xl border border-parle-navy-100 p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-parle-red-500 line-through font-mono text-sm">
                    {mistake.original}
                  </span>
                  <span className="text-parle-navy-300">→</span>
                  <span className="text-parle-blue-600 font-mono text-sm">
                    {mistake.correction}
                  </span>
                </div>
                <p className="text-parle-navy-500 text-xs mt-1">{mistake.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vocabulary Suggestions */}
      <div>
        <h3 className="text-parle-blue-600 font-semibold text-sm mb-2">Vocabulary Suggestions</h3>
        {currentReview.vocabularySuggestions.length === 0 ? (
          <p className="text-parle-navy-500 text-sm">No vocabulary improvements noted.</p>
        ) : (
          <div className="space-y-2">
            {currentReview.vocabularySuggestions.map((vocab, i) => (
              <div
                key={i}
                className="bg-parle-blue-50 rounded-xl border border-parle-navy-100 p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-parle-navy-700 font-mono text-sm">{vocab.used}</span>
                  <span className="text-parle-navy-300">→</span>
                  <span className="text-parle-blue-500 font-mono text-sm">{vocab.better}</span>
                </div>
                <p className="text-parle-navy-500 text-xs mt-1">{vocab.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Topic Suggestions */}
      <div>
        <h3 className="text-parle-blue-600 font-semibold text-sm mb-2">Topics You Could Have Mentioned</h3>
        <TefTopicSuggestionsList topicSuggestions={currentReview.topicSuggestions} />
      </div>

      {/* Bottom carousel controls — mirrors the top so you don't need to scroll up to switch */}
      {reviews.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            aria-label="Previous review"
            className="text-parle-navy-300 hover:text-parle-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-lg px-2"
          >
            ←
          </button>
          <span className="text-parle-navy-500 text-xs">
            Review {currentIndex + 1} of {reviews.length}
          </span>
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === reviews.length - 1}
            aria-label="Next review"
            className="text-parle-navy-300 hover:text-parle-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-lg px-2"
          >
            →
          </button>
        </div>
      )}

      {/* Regenerate button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onRegenerate}
          disabled={isLoading}
          aria-label="Regenerate"
          className="px-4 py-2 bg-parle-navy-100 hover:bg-parle-navy-200 text-parle-navy-700 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
};
