import React from 'react';
import type { TefReview, TefObjectionState } from '../types';
import { TefReviewPanel } from './TefReviewPanel';

interface TefAdSummaryProps {
  elapsedSeconds: number;
  objectionState: TefObjectionState | null;
  adImage: string | null;
  reviews: TefReview[];
  reviewIndex: number;
  onNavigateReview: (i: number) => void;
  isReviewLoading: boolean;
  reviewError: string | null;
  onRetryReview: () => void;
  onRegenerateReview: () => void;
  onDismiss: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const TefAdSummary: React.FC<TefAdSummaryProps> = ({
  elapsedSeconds,
  objectionState,
  adImage,
  reviews,
  reviewIndex,
  onNavigateReview,
  isReviewLoading,
  reviewError,
  onRetryReview,
  onRegenerateReview,
  onDismiss,
}) => {
  const directionsAddressed = objectionState
    ? Math.min(objectionState.currentDirection + 1, 5)
    : 0;
  const isConvinced = objectionState?.isConvinced ?? false;

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-lg w-full p-8 text-center overflow-y-auto max-h-[85vh]">
        {/* Icon */}
        <div className="w-16 h-16 bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-700/50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-amber-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-slate-100 mb-2">Session Complete</h2>
        <p className="text-slate-400 text-sm mb-6">
          Here's how your persuasion session went.
        </p>

        {/* Ad thumbnail */}
        {adImage && (
          <div className="flex justify-center mb-4">
            <img
              src={adImage}
              alt="Advertisement"
              className="w-16 h-16 object-cover rounded-xl border border-slate-600"
            />
          </div>
        )}

        {/* Stats */}
        <div className="space-y-3 text-left mb-6">
          {/* Time used */}
          <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600">
            <span className="text-slate-400 text-sm">Time used</span>
            <span className="text-slate-100 text-sm font-mono font-medium">
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          {/* Directions addressed */}
          <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600">
            <span className="text-slate-400 text-sm">Directions addressed</span>
            <span className="text-slate-100 text-sm font-medium">
              {directionsAddressed} / 5
            </span>
          </div>

          {/* Convinced status */}
          <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600">
            <span className="text-slate-400 text-sm">Convinced</span>
            {isConvinced ? (
              <span className="text-green-400 text-sm font-medium">✓ Yes</span>
            ) : (
              <span className="text-red-400 text-sm font-medium">✗ Not yet</span>
            )}
          </div>
        </div>

        {/* Review panel */}
        <TefReviewPanel
          reviews={reviews}
          currentIndex={reviewIndex}
          onNavigate={onNavigateReview}
          isLoading={isReviewLoading}
          error={reviewError}
          onRetry={onRetryReview}
          onRegenerate={onRegenerateReview}
        />

        {/* Done button */}
        <button
          onClick={onDismiss}
          className="flex-shrink-0 w-full mt-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
