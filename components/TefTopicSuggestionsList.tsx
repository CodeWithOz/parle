import React from 'react';
import type { TefTopicSuggestion } from '../types';

interface TefTopicSuggestionsListProps {
  topicSuggestions: TefTopicSuggestion[];
  className?: string;
  gridOnMd?: boolean;
}

export const TefTopicSuggestionsList: React.FC<TefTopicSuggestionsListProps> = ({
  topicSuggestions,
  className = '',
  gridOnMd = false,
}) => {
  if (topicSuggestions.length === 0) {
    return (
      <p className="text-slate-400 text-sm">No additional topic suggestions were generated.</p>
    );
  }

  const containerClass = gridOnMd
    ? `grid grid-cols-1 md:grid-cols-2 gap-2 ${className}`
    : `space-y-3 ${className}`;

  return (
    <div className={containerClass}>
      {topicSuggestions.map((topicSuggestion, i) => (
        <div
          key={`${topicSuggestion.topic}-${i}`}
          className="bg-slate-700/50 rounded-xl border border-slate-600 p-3"
        >
          <p className="text-violet-300 text-sm font-semibold">{topicSuggestion.topic}</p>
          <div className="mt-2 space-y-2">
            {topicSuggestion.examples.map((example, exampleIndex) => (
              <div
                key={exampleIndex}
                className="rounded-lg bg-slate-800/70 border border-slate-600 p-2"
              >
                <p className="text-slate-100 text-sm">{example.french}</p>
                <p className="text-slate-400 text-xs mt-1">{example.english}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
