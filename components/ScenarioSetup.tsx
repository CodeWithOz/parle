import React, { useState, useEffect } from 'react';
import { Scenario } from '../types';
import { loadScenarios, saveScenario, deleteScenario, generateId } from '../services/scenarioService';

interface ScenarioSetupProps {
  onStartPractice: (scenario: Scenario) => void;
  onClose: () => void;
  isRecordingDescription: boolean;
  isTranscribingDescription: boolean;
  onStartRecordingDescription: () => void;
  onStopRecordingDescription: () => Promise<void>;
  onCancelRecordingDescription: () => void;
  isProcessingScenario: boolean;
  aiSummary: string | null;
  onSubmitDescription: (description: string, name: string) => void;
  onEditScenario: () => void;
  currentDescription: string;
  currentName: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
  showTranscriptOptions: boolean;
  rawTranscript: string | null;
  cleanedTranscript: string | null;
  onSelectTranscript: (useCleaned: boolean) => void;
  onDismissTranscriptOptions: () => void;
  canRetryDescriptionAudio: boolean;
  onRetryDescriptionAudio: () => Promise<void>;
}

export const ScenarioSetup: React.FC<ScenarioSetupProps> = ({
  onStartPractice,
  onClose,
  isRecordingDescription,
  isTranscribingDescription,
  onStartRecordingDescription,
  onStopRecordingDescription,
  onCancelRecordingDescription,
  isProcessingScenario,
  aiSummary,
  onSubmitDescription,
  onEditScenario,
  currentDescription,
  currentName,
  onDescriptionChange,
  onNameChange,
  showTranscriptOptions,
  rawTranscript,
  cleanedTranscript,
  onSelectTranscript,
  onDismissTranscriptOptions,
  canRetryDescriptionAudio,
  onRetryDescriptionAudio,
}) => {
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setSavedScenarios(loadScenarios());
  }, []);

  const handleSubmit = () => {
    if (currentDescription.trim() && currentName.trim()) {
      onSubmitDescription(currentDescription, currentName);
    }
  };

  const handleVoiceInput = async () => {
    if (isRecordingDescription) {
      try {
        // This now triggers the transcript options flow
        await onStopRecordingDescription();
      } catch (error) {
        console.error('Voice transcription failed:', error);
      }
    } else {
      onStartRecordingDescription();
    }
  };

  const handleSelectSaved = (scenario: Scenario) => {
    onNameChange(scenario.name);
    onDescriptionChange(scenario.description);
    setShowSaved(false);
  };

  const handleQuickStart = (scenario: Scenario, e: React.MouseEvent) => {
    e.stopPropagation();
    // Start practice directly with the existing saved scenario
    onStartPractice(scenario);
  };

  const handleDeleteSaved = (scenario: Scenario, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${scenario.name}"? This cannot be undone.`)) {
      try {
        const updated = deleteScenario(scenario.id);
        setSavedScenarios(updated);
      } catch (error) {
        console.error('Error deleting scenario:', error);
        alert(`Failed to delete scenario: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleStartPractice = () => {
    const scenario: Scenario = {
      id: generateId(),
      name: currentName,
      description: currentDescription,
      aiSummary: aiSummary || undefined,
      createdAt: Date.now(),
      isActive: true,
    };

    try {
      // Save to localStorage
      const updated = saveScenario(scenario);
      setSavedScenarios(updated);
      // Only start practice if save succeeded
      onStartPractice(scenario);
    } catch (error) {
      console.error('Error saving scenario:', error);
      alert(`Failed to save scenario: ${error instanceof Error ? error.message : 'Unknown error'}. Practice will not start.`);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-slate-100">Practice Role Play</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Saved Scenarios Toggle */}
          {savedScenarios.length > 0 && !aiSummary && (
            <div>
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showSaved ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {showSaved ? 'Hide' : 'Show'} Saved Scenarios ({savedScenarios.length})
              </button>

              {showSaved && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  <p className="text-slate-500 text-xs mb-2">Click "Start" to practice immediately, or click the row to edit first.</p>
                  {savedScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSaved(scenario)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectSaved(scenario);
                        }
                      }}
                      className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-slate-200 font-medium">{scenario.name}</p>
                        <p className="text-slate-400 text-sm truncate">
                          {scenario.description.length > 80
                            ? `${scenario.description.substring(0, 80)}...`
                            : scenario.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleQuickStart(scenario, e)}
                          onKeyDown={(e) => e.stopPropagation()}
                          aria-label={`Start practicing ${scenario.name}`}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors"
                        >
                          Start
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSaved(scenario, e)}
                          onKeyDown={(e) => e.stopPropagation()}
                          aria-label={`Delete scenario ${scenario.name}`}
                          className="p-1.5 hover:bg-slate-600 rounded transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hover:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!aiSummary ? (
            <>
              {/* Scenario Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Scenario Name
                </label>
                <input
                  type="text"
                  value={currentName}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="e.g., Bakery Visit, Hotel Check-in..."
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Scenario Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Describe Your Experience
                </label>
                <p className="text-slate-400 text-sm mb-3">
                  Tell us about a real experience you had (or want to practice). Be specific about what happened, what you said, and what the other person said.
                </p>
                <textarea
                  value={currentDescription}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  placeholder="Example: I went to a bakery and bought a baguette and two croissants. The baker asked if I wanted anything else, I said no, and then I paid 5 euros."
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Voice Input Button */}
              <div className="flex items-center gap-4">
                {isTranscribingDescription ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg text-slate-300">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Transcribing...</span>
                  </div>
                ) : (
                  <button
                    onClick={showTranscriptOptions ? onDismissTranscriptOptions : handleVoiceInput}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isRecordingDescription
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {showTranscriptOptions ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Discard Transcript
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                        </svg>
                        {isRecordingDescription ? 'Stop Recording' : 'Or describe by voice'}
                      </>
                    )}
                  </button>
                )}

                {isRecordingDescription && (
                  <button
                    onClick={onCancelRecordingDescription}
                    className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {/* Retry button - visible when transcription failed and we have stored audio */}
                {canRetryDescriptionAudio && !isRecordingDescription && !isTranscribingDescription && !showTranscriptOptions && (
                  <button
                    onClick={onRetryDescriptionAudio}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    Retry Transcription
                  </button>
                )}
              </div>

              {/* Transcript Selection UI */}
              {showTranscriptOptions && rawTranscript && cleanedTranscript && (
                <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-slate-200">Choose your transcript version</p>
                  </div>

                  <p className="text-xs text-slate-400">
                    We've created a cleaned-up version of your transcript. Choose which one you'd like to use.
                  </p>

                  {/* Raw Transcript Option */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-300">Original Transcript</span>
                      <span className="text-xs text-slate-500">As spoken</span>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-600 max-h-32 overflow-y-auto">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{rawTranscript}</p>
                    </div>
                    <button
                      onClick={() => onSelectTranscript(false)}
                      className="w-full py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-lg text-sm font-medium transition-colors"
                    >
                      Use Original
                    </button>
                  </div>

                  {/* Cleaned Transcript Option */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-300">Cleaned Transcript</span>
                      <span className="text-xs text-green-400">Fillers removed</span>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-green-600/30 max-h-32 overflow-y-auto">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{cleanedTranscript}</p>
                    </div>
                    <button
                      onClick={() => onSelectTranscript(true)}
                      className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Use Cleaned Version
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!currentDescription.trim() || !currentName.trim() || isProcessingScenario}
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  !currentDescription.trim() || !currentName.trim() || isProcessingScenario
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isProcessingScenario ? 'Processing...' : 'Create Scenario'}
              </button>
            </>
          ) : (
            <>
              {/* AI Summary Display */}
              <div>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Scenario: {currentName}</h3>
                <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                  <p className="text-slate-300 whitespace-pre-wrap">{aiSummary}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    onEditScenario();
                  }}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
                >
                  Edit Description
                </button>
                <button
                  onClick={handleStartPractice}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
                >
                  Start Practice
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
