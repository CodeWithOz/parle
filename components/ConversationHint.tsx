import React, { useState, useEffect } from 'react';

interface ConversationHintProps {
  hint: string | null;
  isVisible: boolean;
}

export const ConversationHint: React.FC<ConversationHintProps> = ({ hint, isVisible }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset dismissed state when a new hint arrives
  useEffect(() => {
    if (hint) {
      setIsDismissed(false);
      setIsExpanded(false);
    }
  }, [hint]);

  if (!hint || !isVisible || isDismissed) {
    return null;
  }

  return (
    <div className="animate-hint-fade-in px-4 py-2">
      <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
        {/* Collapsed view - just shows the toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-400/80 text-sm">💡</span>
            <span className="text-slate-400 text-xs font-medium">
              {isExpanded ? 'Hide suggestion' : 'Need a hint?'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors"
              title="Dismiss hint"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </button>

        {/* Expanded view - shows the actual hint */}
        {isExpanded && (
          <div className="px-3 pb-3 animate-hint-expand">
            <div className="pt-1 border-t border-slate-700/50">
              <p className="text-slate-200 text-sm mt-2 leading-relaxed">
                {hint}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
