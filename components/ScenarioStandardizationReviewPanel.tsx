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
          <div className="h-4 bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-700 rounded w-1/2" />
          <div className="h-16 bg-slate-700 rounded-xl" />
        </div>
        <p className="text-slate-400 text-sm text-center">Generating your review...</p>
      </div>
    );
  }

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

      <div>
        <h3 className="text-slate-200 font-semibold text-sm mb-2">More Standard French</h3>
        <p className="text-slate-400 text-sm">
          Only the places where your spoken French sounded less standard or less idiomatic.
        </p>
      </div>

      {currentReview.items.length === 0 ? (
        <div className="bg-slate-700/40 border border-slate-600 rounded-xl p-4">
          <p className="text-slate-300 text-sm">
            Nothing notable stood out here. Your recorded turns already sounded standard enough.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentReview.items.map((item, i) => (
            <div
              key={`${item.original}-${i}`}
              className="bg-slate-700/50 rounded-xl border border-slate-600 p-4 space-y-3"
            >
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">You said</p>
                <p className="text-slate-300 text-sm">{item.original}</p>
              </div>
              <div className="h-px bg-slate-600" />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-1">More standard</p>
                <p className="text-blue-100 text-sm">{item.standard}</p>
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
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
};
