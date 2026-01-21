import React from 'react';
import { AppState, ScenarioMode, Scenario } from '../types';

interface ControlsProps {
  appState: AppState;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  scenarioMode: ScenarioMode;
  activeScenario: Scenario | null;
  onOpenScenarioSetup: () => void;
  onExitScenario: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  appState,
  playbackSpeed,
  onSpeedChange,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  scenarioMode,
  activeScenario,
  onOpenScenarioSetup,
  onExitScenario,
}) => {
  const isRecording = appState === AppState.RECORDING;
  const isProcessing = appState === AppState.PROCESSING;
  const isPlaying = appState === AppState.PLAYING;
  const isInPracticeMode = scenarioMode === 'practice' && activeScenario;

  // Interaction Handler
  const handleMainButtonClick = () => {
    if (isRecording) {
      onStopRecording();
    } else if (!isProcessing && !isPlaying) {
      onStartRecording();
    } else if (isPlaying) {
      // Optional: Allow interrupting playback to speak again? 
      // For now, let's keep it simple: Wait for finish or just enable recording anyway.
      onStartRecording(); // Allow barge-in
    }
  };

  const buttonLabel = () => {
    if (isProcessing) return "Thinking...";
    if (isRecording) return "I'm Done";
    if (isPlaying) return "Speak"; // Can interrupt
    return "Start Speaking";
  };

  const buttonColor = () => {
    if (isRecording) return "bg-red-500 hover:bg-red-600 shadow-[0_0_30px_rgba(239,68,68,0.5)]";
    if (isProcessing) return "bg-slate-600 cursor-not-allowed";
    return "bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)]";
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto px-6">

      {/* Scenario Mode Indicator / Toggle */}
      {isInPracticeMode ? (
        <div className="w-full bg-green-900/30 p-4 rounded-2xl border border-green-700/50 backdrop-blur-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-300 text-sm font-medium">Scenario Practice</span>
            </div>
            <button
              onClick={onExitScenario}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1 rounded border border-slate-600 hover:border-slate-500 transition-colors"
            >
              Exit Scenario
            </button>
          </div>
          <p className="text-slate-400 text-sm mt-2 truncate">
            {activeScenario.name}
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Say "hint" or "help" if you get stuck!
          </p>
        </div>
      ) : (
        <button
          onClick={onOpenScenarioSetup}
          className="w-full py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h6v4H7V5zm6 6H7v2h6v-2z" clipRule="evenodd" />
          </svg>
          <span className="text-slate-300 text-sm font-medium">Create Practice Scenario</span>
        </button>
      )}

      {/* Speed Control */}
      <div className="w-full bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
        <div className="flex justify-between items-center mb-3">
          <label className="text-slate-400 text-sm font-medium uppercase tracking-wider">AI Voice Speed</label>
          <span className="text-blue-400 font-bold">{playbackSpeed}x</span>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">Slow</span>
            <input
            type="range"
            min="0.5"
            max="1.25"
            step="0.05"
            value={playbackSpeed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-xs text-slate-500">Fast</span>
        </div>
        <div className="flex justify-between mt-2 px-1">
            <button onClick={() => onSpeedChange(0.5)} className={`text-xs px-2 py-1 rounded ${playbackSpeed === 0.5 ? 'bg-blue-500/20 text-blue-300' : 'text-slate-600 hover:text-slate-400'}`}>0.5x</button>
            <button onClick={() => onSpeedChange(0.75)} className={`text-xs px-2 py-1 rounded ${playbackSpeed === 0.75 ? 'bg-blue-500/20 text-blue-300' : 'text-slate-600 hover:text-slate-400'}`}>0.75x</button>
            <button onClick={() => onSpeedChange(1.0)} className={`text-xs px-2 py-1 rounded ${playbackSpeed === 1.0 ? 'bg-blue-500/20 text-blue-300' : 'text-slate-600 hover:text-slate-400'}`}>1.0x</button>
        </div>
      </div>

      {/* Main Action Button */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={handleMainButtonClick}
          disabled={isProcessing}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 ${buttonColor()}`}
        >
          {isRecording ? (
             // Stop Icon
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
             </svg>
          ) : (
             // Mic Icon
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
             </svg>
          )}
        </button>

        <div className="text-slate-400 text-sm font-medium">
          {buttonLabel()}
        </div>

        {/* Cancel Button - Only show when recording */}
        {isRecording && (
          <button
            onClick={onCancelRecording}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-800/50 border border-slate-700/50"
          >
            Cancel (Esc)
          </button>
        )}
      </div>
    </div>
  );
};
