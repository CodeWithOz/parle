import React, { useState } from 'react';
import type { Message, TefReview } from '../types';
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
  messages?: Message[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function groupRepeatedConcepts(
  messages: Message[]
): Map<string, { messages: Array<{ before?: Message; user: Message; after?: Message }> }> {
  // First pass: collect all messages with conceptLabels, grouped by label
  const allConcepts = new Map<string, { hasRepeat: boolean; messages: Array<{ before?: Message; user: Message; after?: Message }> }>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user' || !msg.conceptLabels || msg.conceptLabels.length === 0) {
      continue;
    }

    const before = i > 0 && messages[i - 1].role === 'model' ? messages[i - 1] : undefined;
    const after = i < messages.length - 1 && messages[i + 1].role === 'model' ? messages[i + 1] : undefined;

    for (const label of msg.conceptLabels) {
      if (!allConcepts.has(label)) {
        allConcepts.set(label, { hasRepeat: false, messages: [] });
      }
      const entry = allConcepts.get(label)!;
      if (msg.isRepeat === true) {
        entry.hasRepeat = true;
        entry.messages.push({ before, user: msg, after });
      }
    }
  }

  // Filter to only concepts where at least one message has isRepeat: true
  const filtered = new Map<string, { messages: Array<{ before?: Message; user: Message; after?: Message }> }>();
  for (const [label, group] of allConcepts) {
    if (group.hasRepeat) {
      filtered.set(label, { messages: group.messages });
    }
  }

  return filtered;
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
  messages = [],
}) => {
  const goalMet = questionCount >= questionGoal;
  const repeatedConcepts = groupRepeatedConcepts(messages);
  const [openConcepts, setOpenConcepts] = useState<Set<string>>(new Set());

  function toggleConcept(label: string) {
    setOpenConcepts(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="questioning-summary-title"
    >
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-lg w-full max-h-[85vh] flex flex-col text-center">
        {/* Scrollable content area */}
        <div className="overflow-y-auto p-8 flex-1 min-h-0">
          {/* Icon */}
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-700/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>

          <h2 id="questioning-summary-title" className="text-xl font-bold text-slate-100 mb-2">Session Complete</h2>
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

          {/* Repeated Concepts section */}
          {repeatedConcepts.size > 0 && (
            <div className="mb-6 text-left">
              <h3 className="text-slate-300 text-sm font-semibold mb-3 uppercase tracking-wide">Repeated Concepts</h3>
              <div className="space-y-2">
                {Array.from(repeatedConcepts.entries()).map(([label, group]) => {
                  const isOpen = openConcepts.has(label);
                  return (
                    <div key={label} className="bg-slate-700/50 rounded-xl border border-slate-600 overflow-hidden">
                      {/* Accordion header */}
                      <button
                        type="button"
                        onClick={() => toggleConcept(label)}
                        className="w-full flex items-center justify-between p-3 text-left"
                        aria-expanded={isOpen}
                      >
                        <span className="text-slate-100 text-sm font-medium">
                          {label}
                          <span className="text-slate-400 font-normal ml-1">
                            · asked {group.messages.length + 1} time{group.messages.length + 1 !== 1 ? 's' : ''}
                          </span>
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>

                      {/* Accordion body */}
                      {isOpen && (
                        <div className="border-t border-slate-600 p-3 space-y-4">
                          {group.messages.map((entry, idx) => (
                            <div key={idx} className="space-y-2">
                              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                                {idx === 0 ? 'First mention' : `Repeat #${idx}`}
                              </p>

                              {/* Model message before */}
                              {entry.before && (
                                <div className="rounded-lg bg-slate-800 border border-slate-600 p-2">
                                  <p className="text-xs text-slate-400 mb-1 font-medium">Agent</p>
                                  <p className="text-slate-200 text-sm">{entry.before.text}</p>
                                  {entry.before.audioUrl && (
                                    <audio controls src={entry.before.audioUrl as string} className="mt-2 w-full h-8" />
                                  )}
                                </div>
                              )}

                              {/* User message (highlighted) */}
                              <div className="rounded-lg bg-slate-800 border border-amber-600/50 border-l-4 border-l-amber-500 p-2">
                                <p className="text-xs text-amber-400 mb-1 font-medium">Moi</p>
                                <p className="text-slate-200 text-sm">{entry.user.text}</p>
                                {entry.user.audioUrl && (
                                  <audio controls src={entry.user.audioUrl as string} className="mt-2 w-full h-8" />
                                )}
                              </div>

                              {/* Model message after */}
                              {entry.after && (
                                <div className="rounded-lg bg-slate-800 border border-slate-600 p-2">
                                  <p className="text-xs text-slate-400 mb-1 font-medium">Agent</p>
                                  <p className="text-slate-200 text-sm">{entry.after.text}</p>
                                  {entry.after.audioUrl && (
                                    <audio controls src={entry.after.audioUrl as string} className="mt-2 w-full h-8" />
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
