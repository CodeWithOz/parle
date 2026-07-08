import React from 'react';
import type { Message, ScenarioStandardizationReview } from '../types';
import { ScenarioStandardizationReviewPanel } from './ScenarioStandardizationReviewPanel';

interface ScenarioReviewSummaryProps {
  scenarioName?: string;
  messages: Message[];
  reviews: ScenarioStandardizationReview[];
  reviewIndex: number;
  onNavigateReview: (index: number) => void;
  isReviewLoading: boolean;
  reviewError: string | null;
  onRetryReview: () => void;
  onRegenerateReview: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

export const ScenarioReviewSummary: React.FC<ScenarioReviewSummaryProps> = ({
  scenarioName,
  messages,
  reviews,
  reviewIndex,
  onNavigateReview,
  isReviewLoading,
  reviewError,
  onRetryReview,
  onRegenerateReview,
  onRestart,
  onDismiss,
}) => {
  const userTurnCount = messages.filter((message) => message.role === 'user').length;

  return (
    <div
      className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenario-review-title"
    >
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-lg w-full max-h-[min(85dvh,100%)] flex flex-col min-h-0 text-center">
        <div className="overflow-y-auto overscroll-y-contain p-8 flex-1 min-h-0">
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-700/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 00.293.707l2 2a1 1 0 101.414-1.414L11 9.586V7z" clipRule="evenodd" />
            </svg>
          </div>

          <h2 id="scenario-review-title" className="text-xl font-bold text-slate-100 mb-2">
            Session Complete
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {scenarioName ? `${scenarioName} · ` : ''}review of your spoken French in this role-play.
          </p>

          <div className="space-y-3 text-left mb-6">
            <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl border border-slate-600">
              <span className="text-slate-400 text-sm">Your recorded turns</span>
              <span className="text-slate-100 text-sm font-medium">{userTurnCount}</span>
            </div>
          </div>

          <ScenarioStandardizationReviewPanel
            reviews={reviews}
            currentIndex={reviewIndex}
            onNavigate={onNavigateReview}
            isLoading={isReviewLoading}
            error={reviewError}
            onRetry={onRetryReview}
            onRegenerate={onRegenerateReview}
          />
        </div>

        <div className="p-6 pt-4 border-t border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={onRestart}
              disabled={isReviewLoading}
              className="py-3 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Restart Scenario
            </button>
            <button
              onClick={onDismiss}
              className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
