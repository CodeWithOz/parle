import React from 'react';
import { AppState, ScenarioMode, Scenario, TefAdMode, TefQuestioningMode } from '../types';

interface ControlsProps {
  appState: AppState;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  onCancelRecording: () => void;
  scenarioMode: ScenarioMode;
  activeScenario: Scenario | null;
  onOpenModeSheet: () => void;
  onExitScenario: () => void;
  compact?: boolean;
  // TEF Ad props
  tefAdMode?: TefAdMode;
  onExitTefAd?: () => void;
  // TEF Questioning props
  tefQuestioningMode?: TefQuestioningMode;
  onExitTefQuestioning?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  appState,
  playbackSpeed,
  onSpeedChange,
  onCancelRecording,
  scenarioMode,
  activeScenario,
  onOpenModeSheet,
  onExitScenario,
  compact = false,
  tefAdMode = 'none',
  onExitTefAd,
  tefQuestioningMode = 'none',
  onExitTefQuestioning,
}) => {
  const isRecording = appState === AppState.RECORDING;
  const isInPracticeMode = scenarioMode === 'practice' && activeScenario;
  const isInTefAdPractice = tefAdMode === 'practice';
  const isInTefQuestioningPractice = tefQuestioningMode === 'practice';

  if (compact) {
    return (
      <div className="flex flex-col gap-2 w-full">
        {/* Compact scenario/tef-ad/tef-questioning indicator or buttons */}
        {isInTefQuestioningPractice ? (
          <div className="flex items-center justify-between bg-parle-blue-50 px-3 py-2 rounded-xl border border-parle-blue-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 bg-parle-red-500 rounded-full animate-pulse flex-shrink-0"></div>
              <span className="text-parle-navy-900 text-xs font-medium truncate">Ad Questioning Practice</span>
            </div>
            <button
              onClick={() => onExitTefQuestioning?.()}
              className="text-xs text-parle-red-600 hover:text-parle-red-700 px-2 py-0.5 rounded border border-parle-red-300 hover:border-parle-red-500 transition-colors flex-shrink-0 ml-2"
            >
              Exit
            </button>
          </div>
        ) : isInTefAdPractice ? (
          <div className="flex items-center justify-between bg-parle-blue-50 px-3 py-2 rounded-xl border border-parle-blue-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 bg-parle-red-500 rounded-full animate-pulse flex-shrink-0"></div>
              <span className="text-parle-navy-900 text-xs font-medium truncate">Ad Persuasion Practice</span>
            </div>
            <button
              onClick={() => onExitTefAd?.()}
              className="text-xs text-parle-red-600 hover:text-parle-red-700 px-2 py-0.5 rounded border border-parle-red-300 hover:border-parle-red-500 transition-colors flex-shrink-0 ml-2"
            >
              Exit
            </button>
          </div>
        ) : isInPracticeMode ? (
          <div className="flex items-center justify-between bg-parle-blue-50 px-3 py-2 rounded-xl border border-parle-blue-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 bg-parle-red-500 rounded-full animate-pulse flex-shrink-0"></div>
              <span className="text-parle-navy-900 text-xs font-medium truncate">{activeScenario.name}</span>
            </div>
            <button
              onClick={onExitScenario}
              className="text-xs text-parle-red-600 hover:text-parle-red-700 px-2 py-0.5 rounded border border-parle-red-300 hover:border-parle-red-500 transition-colors flex-shrink-0 ml-2"
            >
              Exit
            </button>
          </div>
        ) : !isRecording && (
          <button
            onClick={onOpenModeSheet}
            aria-label="Start Practice"
            className="flex items-center gap-1.5 text-xs text-parle-navy-500 hover:text-parle-navy-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span>Start Practice</span>
          </button>
        )}

        {/* Compact speed + cancel row */}
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button
              onClick={onCancelRecording}
              className="px-3 py-1.5 text-xs font-medium text-parle-navy-500 hover:text-parle-navy-900 transition-colors rounded-lg hover:bg-parle-blue-50 border border-parle-navy-100"
            >
              Cancel (Esc)
            </button>
          ) : (
            <>
              <span className="text-xs text-parle-navy-500 flex-shrink-0">Speed</span>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={playbackSpeed}
                onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                className="flex-grow h-1.5 bg-parle-navy-100 rounded-lg appearance-none cursor-pointer accent-parle-blue-500 max-w-[160px]"
              />
              <span className="text-xs text-parle-blue-600 font-medium flex-shrink-0 w-8">{playbackSpeed}x</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // Full (landing page) mode — ordered top-to-bottom: speed, scenario, cancel
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto px-6">

      {/* Speed Control */}
      <div className="w-full bg-white p-4 rounded-2xl border border-parle-navy-100 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <label className="text-parle-navy-500 text-sm font-medium uppercase tracking-wider">AI Voice Speed</label>
          <span className="text-parle-blue-600 font-bold">{playbackSpeed}x</span>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-xs text-parle-navy-500">Slow</span>
            <input
            type="range"
            min="0.5"
            max="1"
            step="0.05"
            value={playbackSpeed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-parle-navy-100 rounded-lg appearance-none cursor-pointer accent-parle-blue-500"
            />
            <span className="text-xs text-parle-navy-500">Normal</span>
        </div>
        <div className="flex justify-between mt-2 px-1">
            <button onClick={() => onSpeedChange(0.5)} className={`text-xs px-2 py-1 rounded ${playbackSpeed === 0.5 ? 'bg-parle-blue-100 text-parle-blue-700' : 'text-parle-navy-300 hover:text-parle-navy-500'}`}>0.5x</button>
            <button onClick={() => onSpeedChange(0.75)} className={`text-xs px-2 py-1 rounded ${playbackSpeed === 0.75 ? 'bg-parle-blue-100 text-parle-blue-700' : 'text-parle-navy-300 hover:text-parle-navy-500'}`}>0.75x</button>
            <button onClick={() => onSpeedChange(1.0)} className={`text-xs px-2 py-1 rounded ${playbackSpeed === 1.0 ? 'bg-parle-blue-100 text-parle-blue-700' : 'text-parle-navy-300 hover:text-parle-navy-500'}`}>1.0x</button>
        </div>
      </div>

      {/* Scenario / TEF Ad / TEF Questioning Mode Indicator or Toggle */}
      {isInTefQuestioningPractice ? (
        <div className="w-full bg-parle-blue-50 p-4 rounded-2xl border border-parle-blue-100">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-parle-red-500 rounded-full animate-pulse"></div>
              <span className="text-parle-navy-900 text-sm font-medium">Ad Questioning Practice</span>
            </div>
            <button
              onClick={() => onExitTefQuestioning?.()}
              className="text-xs text-parle-red-600 hover:text-parle-red-700 px-3 py-1 rounded border border-parle-red-300 hover:border-parle-red-500 transition-colors"
            >
              Exit
            </button>
          </div>
          <p className="text-parle-navy-500 text-xs mt-2">
            Ask as many questions as you can about the advertisement!
          </p>
        </div>
      ) : isInTefAdPractice ? (
        <div className="w-full bg-parle-blue-50 p-4 rounded-2xl border border-parle-blue-100">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-parle-red-500 rounded-full animate-pulse"></div>
              <span className="text-parle-navy-900 text-sm font-medium">Ad Persuasion Practice</span>
            </div>
            <button
              onClick={() => onExitTefAd?.()}
              className="text-xs text-parle-red-600 hover:text-parle-red-700 px-3 py-1 rounded border border-parle-red-300 hover:border-parle-red-500 transition-colors"
            >
              Exit
            </button>
          </div>
          <p className="text-parle-navy-500 text-xs mt-2">
            Convince your French friend about the advertisement!
          </p>
        </div>
      ) : isInPracticeMode ? (
        <div className="w-full bg-parle-blue-50 p-4 rounded-2xl border border-parle-blue-100">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-parle-red-500 rounded-full animate-pulse"></div>
              <span className="text-parle-navy-900 text-sm font-medium">Scenario Practice</span>
            </div>
            <button
              onClick={onExitScenario}
              className="text-xs text-parle-red-600 hover:text-parle-red-700 px-3 py-1 rounded border border-parle-red-300 hover:border-parle-red-500 transition-colors"
            >
              Exit Scenario
            </button>
          </div>
          <p className="text-parle-navy-700 text-sm mt-2 truncate">
            {activeScenario.name}
          </p>
          <p className="text-parle-navy-500 text-xs mt-1">
            Say "hint" or "help" if you get stuck!
          </p>
        </div>
      ) : (
        <button
          onClick={onOpenModeSheet}
          aria-label="Start Practice"
          className="w-full py-3 bg-white hover:bg-parle-blue-50 border border-parle-navy-100 hover:border-parle-blue-300 rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-parle-navy-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          <span className="text-parle-navy-700 text-sm font-medium">Start Practice</span>
        </button>
      )}

    </div>
  );
};
