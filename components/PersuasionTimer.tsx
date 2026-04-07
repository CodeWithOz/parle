import React from 'react';

interface PersuasionTimerProps {
  elapsed: number;
  totalSeconds?: number;
  isPaused: boolean;
  turnCount?: number;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const PersuasionTimer: React.FC<PersuasionTimerProps> = ({
  elapsed,
  totalSeconds = 600,
  isPaused,
  turnCount,
}) => {
  const remaining = Math.max(0, totalSeconds - elapsed);
  const isLow = remaining <= 120 && remaining > 30;
  const isCritical = remaining <= 30 && remaining > 0;
  const isFinished = remaining === 0;

  const colorClass = isFinished
    ? 'text-slate-400'
    : isCritical
    ? 'text-red-400'
    : isLow
    ? 'text-amber-400'
    : 'text-slate-200';

  const bgClass = isFinished
    ? 'bg-slate-800/50 border-slate-700/50'
    : isCritical
    ? 'bg-red-900/20 border-red-700/50'
    : isLow
    ? 'bg-amber-900/20 border-amber-700/50'
    : 'bg-slate-800/50 border-slate-700/50';

  const pulseClass = isCritical ? 'animate-pulse' : '';

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${bgClass} ${pulseClass}`}
      title={isPaused ? 'Timer paused (AI is responding)' : 'Conversation timer'}
    >
      {isPaused ? (
        /* Pause icon */
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ) : (
        /* Clock icon */
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${colorClass}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      )}
      <span className={`text-sm font-mono font-medium ${colorClass}`}>
        {isFinished ? '00:00' : formatTime(remaining)}
      </span>
      {turnCount !== undefined && (
        <span className="text-xs font-medium text-slate-300 ml-1">
          Turn {turnCount}
        </span>
      )}
    </div>
  );
};
