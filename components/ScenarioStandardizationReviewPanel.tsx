import React from 'react';
import type { ScenarioStandardizationReview } from '../types';

interface ScenarioStandardizationReviewPanelProps {
  reviews: ScenarioStandardizationReview[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onRegenerate: () => void;
}

export const ScenarioStandardizationReviewPanel: React.FC<ScenarioStandardizationReviewPanelProps> = ({
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

  if (isLoading && !hasReviews) {
    return (
      <div className="mt-6 text-left space-y-5" role="status">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-parle-navy-100 rounded w-3/4" />
          <div className="h-4 bg-parle-navy-100 rounded w-1/2" />
          <div className="h-16 bg-parle-navy-100 rounded-xl" />
        </div>
        <p className="text-parle-navy-500 text-sm text-center">Generating your review...</p>
      </div>
    );
  }

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

  if (!currentReview) {
    return null;
  }

  return (
    <div className="mt-6 text-left space-y-5">
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

      <div>
        <h3 className="text-parle-navy-900 font-semibold text-sm mb-2">More Standard French</h3>
        <p className="text-parle-navy-500 text-sm">
          Only the places where your spoken French sounded less standard or less idiomatic.
        </p>
      </div>

      {currentReview.items.length === 0 ? (
        <div className="bg-parle-blue-50 border border-parle-navy-100 rounded-xl p-4">
          <p className="text-parle-navy-700 text-sm">
            Nothing notable stood out here. Your recorded turns already sounded standard enough.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentReview.items.map((item, i) => (
            <div
              key={`${item.original}-${i}`}
              className="bg-parle-blue-50 rounded-xl border border-parle-navy-100 p-4 space-y-3"
            >
              <div>
                <p className="text-[11px] uppercase tracking-wider text-parle-navy-300 mb-1">You said</p>
                <p className="text-parle-navy-700 text-sm">{item.original}</p>
              </div>
              <div className="h-px bg-parle-navy-100" />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-parle-blue-600 mb-1">More standard</p>
                <p className="text-parle-blue-700 text-sm">{item.standard}</p>
              </div>
            </div>
          ))}
        </div>
      )}

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
