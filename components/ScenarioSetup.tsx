import React, { useState, useEffect } from 'react';
import { Scenario } from '../types';
import { loadScenarios, saveScenario, deleteScenario, generateId } from '../services/scenarioService';

interface ScenarioSetupProps {
  onStartPractice: (scenario: Scenario) => void;
  onClose: () => void;
  isRecordingDescription: boolean;
  onStartRecordingDescription: () => void;
  onStopRecordingDescription: () => Promise<string>;
  onCancelRecordingDescription: () => void;
  isProcessingScenario: boolean;
  aiSummary: string | null;
  onSubmitDescription: (description: string, name: string) => void;
  onConfirmScenario: () => void;
  currentDescription: string;
  currentName: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
}

export const ScenarioSetup: React.FC<ScenarioSetupProps> = ({
  onStartPractice,
  onClose,
  isRecordingDescription,
  onStartRecordingDescription,
  onStopRecordingDescription,
  onCancelRecordingDescription,
  isProcessingScenario,
  aiSummary,
  onSubmitDescription,
  onConfirmScenario,
  currentDescription,
  currentName,
  onDescriptionChange,
  onNameChange,
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
        const transcription = await onStopRecordingDescription();
        onDescriptionChange(transcription);
      } catch (error) {
        console.error('Voice transcription failed:', error);
        // Optionally notify user via toast/alert or parent callback
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

  const handleDeleteSaved = (scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteScenario(scenarioId);
    setSavedScenarios(updated);
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

    // Save to localStorage
    const updated = saveScenario(scenario);
    setSavedScenarios(updated);

    onStartPractice(scenario);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-slate-100">Create Practice Scenario</h2>
          <button
            onClick={onClose}
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
                {showSaved ? 'Hide' : 'Load'} Saved Scenarios ({savedScenarios.length})
              </button>

              {showSaved && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {savedScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      onClick={() => handleSelectSaved(scenario)}
                      className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"
                    >
                      <div>
                        <p className="text-slate-200 font-medium">{scenario.name}</p>
                        <p className="text-slate-400 text-sm truncate max-w-md">
                          {scenario.description.length > 80
                            ? `${scenario.description.substring(0, 80)}...`
                            : scenario.description}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSaved(scenario.id, e)}
                        className="p-1.5 hover:bg-slate-600 rounded transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hover:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
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
                <button
                  onClick={handleVoiceInput}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isRecordingDescription
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                  {isRecordingDescription ? 'Stop Recording' : 'Or describe by voice'}
                </button>

                {isRecordingDescription && (
                  <button
                    onClick={onCancelRecordingDescription}
                    className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>

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
                    onConfirmScenario();
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
