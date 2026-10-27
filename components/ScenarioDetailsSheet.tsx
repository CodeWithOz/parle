import React from 'react';
import type { Scenario } from '../types';
import { confirmDelete } from '../utils/confirmDelete';

interface ScenarioDetailsSheetProps {
  open: boolean;
  scenario: Scenario | null;
  onClose: () => void;
  onStart: (scenario: Scenario) => void;
  onDelete: (scenario: Scenario) => void;
  onUseAsTemplate: (scenario: Scenario) => void;
}

export const ScenarioDetailsSheet: React.FC<ScenarioDetailsSheetProps> = ({
  open,
  scenario,
  onClose,
  onStart,
  onDelete,
  onUseAsTemplate,
}) => {
  if (!open || !scenario) return null;

  const characters = scenario.characters ?? [];
  const steps = scenario.steps ?? [];

  const handleDelete = () => {
    if (!confirmDelete(`Delete "${scenario.name}"? This cannot be undone.`)) return;
    onDelete(scenario);
  };

  return (
    <div className="fixed inset-0 bg-parle-navy-900/40 z-[60] flex items-center justify-center p-4 overscroll-none">
      <div
        className="bg-white border border-parle-navy-100 rounded-2xl max-w-2xl w-full max-h-[min(88dvh,100%)] flex flex-col min-h-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-details-title"
      >
        <div className="flex justify-between items-start p-5 border-b border-parle-navy-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 id="scenario-details-title" className="text-lg font-semibold text-parle-navy-900">
              {scenario.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-parle-navy-500">
                {new Date(scenario.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              {scenario.isTefQuestioning && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-parle-red-100 text-parle-red-700">
                  TEF Questioning
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-parle-blue-50 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-parle-navy-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto overscroll-y-contain flex-1 min-h-0 p-5 space-y-5">
          <p className="text-sm text-parle-navy-700 whitespace-pre-wrap">{scenario.description}</p>

          {scenario.aiSummary && (
            <section>
              <h3 className="text-sm font-semibold text-parle-blue-600 mb-2">AI summary</h3>
              <p className="text-sm text-parle-navy-700 whitespace-pre-wrap">{scenario.aiSummary}</p>
            </section>
          )}

          {characters.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-parle-blue-600 mb-2">Characters</h3>
              <div className="space-y-2">
                {characters.map((character) => (
                  <div
                    key={character.id}
                    className="p-3 rounded-xl bg-parle-blue-50 border border-parle-navy-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-parle-navy-900">{character.name}</span>
                      <span className="text-[10px] text-parle-navy-500">{character.voiceName}</span>
                    </div>
                    <div className="text-xs text-parle-navy-500">{character.role}</div>
                    {character.description && (
                      <p className="text-xs text-parle-navy-700 mt-1">{character.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {steps.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-parle-blue-600 mb-2">Roadmap</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-parle-navy-700">
                {steps.map((step) => (
                  <li key={step.id}>{step.text}</li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <div className="p-5 border-t border-parle-navy-100 flex-shrink-0 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDelete}
            aria-label={`Delete ${scenario.name}`}
            className="text-xs text-parle-red-600 hover:text-parle-red-700"
          >
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUseAsTemplate(scenario)}
              className="text-xs text-parle-navy-700 hover:text-parle-navy-900 px-3 py-1.5 rounded-lg border border-parle-navy-200"
            >
              Use as template
            </button>
            <button
              type="button"
              onClick={() => onStart(scenario)}
              aria-label={`Start practicing ${scenario.name}`}
              className="text-xs font-medium text-white px-3 py-1.5 rounded-lg bg-parle-blue-500 hover:bg-parle-blue-600"
            >
              Start
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
