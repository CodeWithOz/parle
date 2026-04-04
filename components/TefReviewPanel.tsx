import React from 'react';
import type { TefReview } from '../types';

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
          <div className="h-4 bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-700 rounded w-1/2" />
          <div className="h-4 bg-slate-700 rounded w-2/3" />
        </div>
        <p className="text-slate-400 text-sm text-center">Generating your review...</p>
      </div>
    );
  }

  // Error state (not loading)
  if (error !== null && !isLoading) {
    return (
      <div className="mt-6 text-left space-y-5">
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4">
          <p className="text-amber-300 text-sm">{error}</p>
          <button
            onClick={onRetry}
            className="mt-3 px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors"
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
            className="text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-lg px-2"
          >
            ←
          </button>
          <span className="text-slate-400 text-xs">
            Review {currentIndex + 1} of {reviews.length}
          </span>
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === reviews.length - 1}
            aria-label="Next review"
            className="text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-lg px-2"
          >
            →
          </button>
        </div>
      )}

      {/* CEFR badge */}
      <div>
        <div className="flex justify-center">
          <span className="inline-block bg-blue-900/50 text-blue-300 border border-blue-700/50 rounded-full px-3 py-1 text-sm font-bold">
            {currentReview.cefrLevel}
          </span>
        </div>
        <p className="text-slate-400 text-sm text-center mt-2">{currentReview.cefrJustification}</p>
      </div>

      {/* What Went Well */}
      <div>
        <h3 className="text-green-400 font-semibold text-sm mb-2">What Went Well</h3>
        <ul className="space-y-1">
          {currentReview.wentWell.map((item, i) => (
            <li key={i} className="text-slate-300 text-sm flex gap-2">
              <span className="text-green-400">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Mistakes */}
      <div>
        <h3 className="text-amber-400 font-semibold text-sm mb-2">Mistakes</h3>
        {currentReview.mistakes.length === 0 ? (
          <p className="text-slate-400 text-sm">No significant mistakes noted.</p>
        ) : (
          <div className="space-y-2">
            {currentReview.mistakes.map((mistake, i) => (
              <div
                key={i}
                className="bg-slate-700/50 rounded-xl border border-slate-600 p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-red-400 line-through font-mono text-sm">
                    {mistake.original}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="text-green-400 font-mono text-sm">
                    {mistake.correction}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-1">{mistake.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vocabulary Suggestions */}
      <div>
        <h3 className="text-sky-400 font-semibold text-sm mb-2">Vocabulary Suggestions</h3>
        {currentReview.vocabularySuggestions.length === 0 ? (
          <p className="text-slate-400 text-sm">No vocabulary improvements noted.</p>
        ) : (
          <div className="space-y-2">
            {currentReview.vocabularySuggestions.map((vocab, i) => (
              <div
                key={i}
                className="bg-slate-700/50 rounded-xl border border-slate-600 p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300 font-mono text-sm">{vocab.used}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-sky-300 font-mono text-sm">{vocab.better}</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">{vocab.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips for C1 */}
      <div>
        <h3 className="text-purple-400 font-semibold text-sm mb-2">Tips for C1</h3>
        <ol className="space-y-1">
          {currentReview.tipsForC1.map((tip, i) => (
            <li key={i} className="text-slate-300 text-sm flex gap-2">
              <span className="text-purple-400">{i + 1}.</span>
              {tip}
            </li>
          ))}
        </ol>
      </div>

      {/* Regenerate button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onRegenerate}
          disabled={isLoading}
          aria-label="Regenerate"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
};
