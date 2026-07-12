import React, { useEffect, useState } from 'react';
import type { TefTopicSuggestion } from '../types';

interface PracticeGuidePanelProps {
  topics: TefTopicSuggestion[];
}

export const PracticeGuidePanel: React.FC<PracticeGuidePanelProps> = ({ topics }) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(
    topics.length > 0 ? topics[0].topic : null
  );

  useEffect(() => {
    if (topics.length > 0) {
      setExpandedTopic(topics[0].topic);
    } else {
      setExpandedTopic(null);
    }
  }, [topics]);

  if (topics.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-parle-blue-300 bg-parle-blue-50">
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className="w-full flex items-center gap-2 p-3"
        aria-expanded={panelOpen}
      >
        <span className="text-parle-blue-600 text-sm" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-parle-blue-700">Practice guide</div>
          <div className="text-[11px] text-parle-navy-500">
            {topics.length} topics · from your last review
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-parle-blue-600 transition-transform duration-200 ${panelOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {panelOpen && (
        <div className="px-3 pb-3 space-y-1.5 max-h-72 overflow-y-auto">
          {topics.map((t) => {
            const isOpen = expandedTopic === t.topic;
            return (
              <div
                key={t.topic}
                className="rounded-lg bg-white border border-parle-navy-100 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedTopic(isOpen ? null : t.topic)}
                  className="w-full flex items-center justify-between p-2.5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-xs font-medium text-parle-blue-700">{t.topic}</span>
                  <svg
                    className={`w-3.5 h-3.5 text-parle-navy-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-2.5 pb-2.5 space-y-1.5">
                    {t.examples.map((ex, idx) => (
                      <div key={idx}>
                        <div className="text-xs text-parle-navy-900">{ex.french}</div>
                        <div className="text-[11px] text-parle-navy-500">{ex.english}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
