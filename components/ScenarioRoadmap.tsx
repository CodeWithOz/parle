import React from 'react';
import { ScenarioStep } from '../types';
import { getRoadmapStepStatus } from '../utils/roadmapStepStatus';

interface ScenarioRoadmapProps {
  steps: ScenarioStep[];
  currentStepIndex: number | undefined;
  className?: string;
}

/**
 * Presentational scenario roadmap step list — done (✓ checked-off), current
 * (highlighted with a distinct marker), upcoming (plain). Reused inside the
 * desktop static sidebar column, the tablet right-edge drawer, and the
 * mobile bottom sheet.
 */
export const ScenarioRoadmap: React.FC<ScenarioRoadmapProps> = ({ steps, currentStepIndex, className = '' }) => {
  const statuses = getRoadmapStepStatus(steps.length, currentStepIndex);

  return (
    <ol className={`flex flex-col gap-1.5 ${className}`}>
      {steps.map((step, i) => {
        const status = statuses[i];
        const isDone = status === 'done';
        const isCurrent = status === 'current';
        return (
          <li
            key={step.id}
            className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
              isCurrent
                ? 'bg-parle-blue-100 border border-parle-blue-500 text-parle-navy-900 font-medium'
                : 'text-parle-navy-700'
            }`}
          >
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] mt-0.5 ${
                isDone
                  ? 'bg-parle-blue-500 border-parle-navy-900 text-white'
                  : isCurrent
                  ? 'bg-parle-red-500 border-parle-red-700 text-white'
                  : 'bg-white border-parle-navy-200'
              }`}
              aria-hidden="true"
            >
              {isDone ? '✓' : isCurrent ? '▶' : ''}
            </span>
            <span className={isDone ? 'line-through text-parle-navy-500' : ''}>{step.text}</span>
          </li>
        );
      })}
    </ol>
  );
};
