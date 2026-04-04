import React from 'react';
import type { TefReview } from '../types';
import { TefReviewPanel } from './TefReviewPanel';

interface TefQuestioningSummaryProps {
  questionCount: number;
  questionGoal?: number;
  repeatCount: number;
  elapsedSeconds: number;
  adImage: string | null;
  onDismiss: () => void;
  // Review props
  reviews: TefReview[];
  reviewIndex: number;
  onNavigateReview: (i: number) => void;
  isReviewLoading: boolean;
  reviewError: string | null;
  onRetryReview: () => void;
  onRegenerateReview: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const TefQuestioningSummary: React.FC<TefQuestioningSummaryProps> = ({
  questionCount,
  questionGoal = 10,
  repeatCount,
  elapsedSeconds,
  adImage,
  onDismiss,
  reviews,
  reviewIndex,
  onNavigateReview,
  isReviewLoading,
  reviewError,
  onRetryReview,
  onRegenerateReview,
}) => {
  const goalMet = questionCount >= questionGoal;

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-lg w-full max-h-[85vh] flex flex-col text-center">
        {/* Scrollable content area */}
        <div className="overflow-y-auto p-8 flex-1 min-h-0">
          {/* Icon */}
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-700/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-slate-100 mb-2">Session Complete</h2>
          <p className="text-slate-400 text-sm mb-6">Here's how your questioning session went.</p>

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
              <span className="text-slate-100 text-sm font-mono font-medium">{formatTime(elapsedSeconds)}</span>
            </div>

            {/* Questions asked */}
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600">
              <span className="text-slate-400 text-sm">Questions asked</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-100 text-sm font-medium">
                  {questionCount} / {questionGoal}
                </span>
                {goalMet ? (
                  <span className="text-green-400 text-sm">&#10003;</span>
                ) : (
                  <span className="text-red-400 text-sm">&#10007;</span>
                )}
              </div>
            </div>

            {/* Repeats */}
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600">
              <span className="text-slate-400 text-sm">Repeats flagged by AI</span>
              <span className={`text-sm font-medium ${repeatCount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {repeatCount}
              </span>
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
        </div>

        {/* Done button — pinned outside the scroll area */}
        <div className="p-6 pt-4 border-t border-slate-700">
          <button
            onClick={onDismiss}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
