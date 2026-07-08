import React, { useState, useEffect, useRef } from 'react';
import { Scenario, Character } from '../types';
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
  geminiKeyMissing: boolean;
  openaiKeyMissing: boolean;
  characters?: Character[]; // NEW: Characters for this scenario
  roadmapSteps: string[]; // NEW: editable roadmap step texts, in order
  onRoadmapStepsChange: (steps: string[]) => void;
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
  geminiKeyMissing,
  openaiKeyMissing,
  characters,
  roadmapSteps,
  onRoadmapStepsChange,
}) => {
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const transcriptOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedScenarios(loadScenarios());
  }, []);

  // Scroll transcript options into view when they appear
  useEffect(() => {
    if (showTranscriptOptions && transcriptOptionsRef.current) {
      transcriptOptionsRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [showTranscriptOptions]);

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

  // Roadmap editor handlers — controlled: every interaction calls
  // onRoadmapStepsChange with a new array, never mutates roadmapSteps in place.
  const handleRoadmapStepTextChange = (index: number, text: string) => {
    const next = roadmapSteps.slice();
    next[index] = text;
    onRoadmapStepsChange(next);
  };

  const handleRoadmapStepRemove = (index: number) => {
    const next = roadmapSteps.slice();
    next.splice(index, 1);
    onRoadmapStepsChange(next);
  };

  const handleRoadmapStepMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= roadmapSteps.length) return;
    const next = roadmapSteps.slice();
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onRoadmapStepsChange(next);
  };

  const handleRoadmapAddStep = () => {
    onRoadmapStepsChange([...roadmapSteps, '']);
  };

  const handleStartPractice = () => {
    const steps = roadmapSteps
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .map((text, idx) => ({ id: `${generateId()}_step${idx}`, text }));

    const scenario: Scenario = {
      id: generateId(),
      name: currentName,
      description: currentDescription,
      aiSummary: aiSummary || undefined,
      createdAt: Date.now(),
      isActive: true,
      characters: characters, // Include characters data
      steps,
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
    <div className="fixed inset-0 bg-parle-navy-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-parle-navy-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-parle-navy-100">
          <h2 className="text-xl font-bold text-parle-navy-900">Practice Role Play</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-parle-blue-50 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-parle-navy-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Warning for missing API keys */}
        {(geminiKeyMissing || openaiKeyMissing) && (
          <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-400 rounded-lg">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-amber-900 mb-1">API Keys Required</h3>
                <p className="text-sm text-amber-800">
                  {geminiKeyMissing && openaiKeyMissing
                    ? 'Both Gemini and OpenAI API keys are required for scenario creation. Gemini is used for audio transcription when you describe a scenario and OpenAI is used for planning how the scenario will unfold during the conversation.'
                    : geminiKeyMissing
                    ? 'Gemini API key is required for audio transcription when you describe a scenario.'
                    : 'OpenAI API key is required for planning how the scenario will unfold during the conversation.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Saved Scenarios Toggle */}
          {savedScenarios.length > 0 && !aiSummary && (
            <div>
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="text-sm text-parle-blue-600 hover:text-parle-blue-700 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showSaved ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {showSaved ? 'Hide' : 'Show'} Saved Scenarios ({savedScenarios.length})
              </button>

              {showSaved && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  <p className="text-parle-navy-500 text-xs mb-2">Click "Start" to practice immediately, or click the row to edit first.</p>
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
                      className="flex justify-between items-center p-3 bg-parle-blue-50 rounded-lg cursor-pointer hover:bg-parle-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-parle-blue-500"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-parle-navy-900 font-medium">{scenario.name}</p>
                        <p className="text-parle-navy-500 text-sm truncate">
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
                          className="px-3 py-1.5 bg-parle-blue-500 hover:bg-parle-blue-600 text-white text-xs font-medium rounded transition-colors"
                        >
                          Start
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSaved(scenario, e)}
                          onKeyDown={(e) => e.stopPropagation()}
                          aria-label={`Delete scenario ${scenario.name}`}
                          className="p-1.5 hover:bg-parle-red-50 rounded transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-parle-navy-400 hover:text-parle-red-500" viewBox="0 0 20 20" fill="currentColor">
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
                <label className="block text-sm font-medium text-parle-navy-700 mb-2">
                  Scenario Name
                </label>
                <input
                  type="text"
                  value={currentName}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="e.g., Bakery Visit, Hotel Check-in..."
                  className="w-full px-4 py-3 bg-white border border-parle-navy-200 rounded-lg text-parle-navy-900 placeholder-parle-navy-300 focus:outline-none focus:ring-2 focus:ring-parle-blue-500 focus:border-transparent"
                />
              </div>

              {/* Scenario Description */}
              <div>
                <label className="block text-sm font-medium text-parle-navy-700 mb-2">
                  Describe Your Experience
                </label>
                <p className="text-parle-navy-500 text-sm mb-3">
                  Tell us about a real experience you had (or want to practice). Be specific about what happened, what you said, and what the other person said.
                </p>
                <textarea
                  value={currentDescription}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  placeholder="Example: I went to a bakery and bought a baguette and two croissants. The baker asked if I wanted anything else, I said no, and then I paid 5 euros."
                  rows={5}
                  className="w-full px-4 py-3 bg-white border border-parle-navy-200 rounded-lg text-parle-navy-900 placeholder-parle-navy-300 focus:outline-none focus:ring-2 focus:ring-parle-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Voice Input Button */}
              <div className="flex items-center gap-4">
                {isTranscribingDescription ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-parle-blue-50 rounded-lg text-parle-navy-700">
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
                        : 'bg-parle-blue-50 hover:bg-parle-blue-100 text-parle-navy-700'
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
                    className="px-4 py-2 text-parle-navy-500 hover:text-parle-navy-700 transition-colors"
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
                <div ref={transcriptOptionsRef} className="space-y-4 p-4 bg-parle-blue-50 rounded-lg border border-parle-navy-200">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-parle-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-parle-navy-900">Choose your transcript version</p>
                  </div>

                  <p className="text-xs text-parle-navy-500">
                    We've created a cleaned-up version of your transcript. Choose which one you'd like to use.
                  </p>

                  {/* Raw Transcript Option */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-parle-navy-700">Original Transcript</span>
                      <span className="text-xs text-parle-navy-500">As spoken</span>
                    </div>
                    <div className="p-3 bg-parle-blue-50 rounded-lg border border-parle-navy-200 max-h-32 overflow-y-auto">
                      <p className="text-sm text-parle-navy-700 whitespace-pre-wrap">{rawTranscript}</p>
                    </div>
                    <button
                      onClick={() => onSelectTranscript(false)}
                      className="w-full py-2 bg-parle-navy-200 hover:bg-parle-navy-300 text-parle-navy-900 rounded-lg text-sm font-medium transition-colors"
                    >
                      Use Original
                    </button>
                  </div>

                  {/* Cleaned Transcript Option */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-parle-navy-700">Cleaned Transcript</span>
                      <span className="text-xs text-green-400">Fillers removed</span>
                    </div>
                    <div className="p-3 bg-parle-blue-50 rounded-lg border border-parle-blue-300 max-h-32 overflow-y-auto">
                      <p className="text-sm text-parle-navy-700 whitespace-pre-wrap">{cleanedTranscript}</p>
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
                    ? 'bg-parle-navy-100 text-parle-navy-300 cursor-not-allowed'
                    : 'bg-parle-blue-500 hover:bg-parle-blue-600 text-white'
                }`}
              >
                {isProcessingScenario ? 'Processing...' : 'Create Scenario'}
              </button>
            </>
          ) : (
            <>
              {/* AI Summary Display */}
              <div>
                <h3 className="text-lg font-medium text-parle-navy-900 mb-2">Scenario: {currentName}</h3>
                <div className="p-4 bg-parle-blue-50 rounded-lg border border-parle-navy-200">
                  <p className="text-parle-navy-700 whitespace-pre-wrap">{aiSummary}</p>
                </div>
              </div>

              {/* Characters Display */}
              {characters && characters.length > 1 && (
                <div>
                  <h4 className="text-sm font-medium text-parle-navy-700 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-parle-blue-600" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                    Characters in this scenario
                  </h4>
                  <div className="space-y-2">
                    {characters.map(char => (
                      <div key={char.id} className="flex justify-between items-center p-3 bg-parle-blue-50 rounded-lg border border-parle-navy-100">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-parle-blue-500 rounded-full"></div>
                            <p className="text-sm font-medium text-parle-navy-900">{char.name}</p>
                          </div>
                          <p className="text-xs text-parle-navy-500 ml-4 mt-1">{char.role}</p>
                          {char.description && (
                            <p className="text-xs text-parle-navy-500 ml-4 mt-1">{char.description}</p>
                          )}
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-xs text-parle-navy-500">Voice</p>
                          <p className="text-xs font-medium text-parle-blue-600">{char.voiceName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Roadmap Editor — confirm + edit the scenario roadmap (wireframe 3d/4d) */}
              <div>
                <h4 className="text-sm font-medium text-parle-navy-700 mb-1">Your Roadmap</h4>
                <p className="text-xs text-parle-navy-500 mb-3">
                  Drag to reorder, edit or remove any step. This maps out the scenario so you always know what's next.
                </p>
                <div data-testid="roadmap-step-list" className="space-y-2">
                  {roadmapSteps.map((stepText, index) => (
                    <div
                      key={index}
                      data-testid={`roadmap-step-${index}`}
                      className="flex items-center gap-2 p-2 bg-parle-blue-50 rounded-lg border border-parle-navy-100"
                    >
                      <span className="text-parle-navy-300 cursor-grab select-none px-1" aria-hidden="true">⋮⋮</span>
                      <input
                        type="text"
                        data-testid={`roadmap-step-input-${index}`}
                        value={stepText}
                        onChange={(e) => handleRoadmapStepTextChange(index, e.target.value)}
                        placeholder={`Step ${index + 1}`}
                        className="flex-1 min-w-0 px-3 py-2 bg-white border border-parle-navy-200 rounded-lg text-parle-navy-900 placeholder-parle-navy-300 text-sm focus:outline-none focus:ring-2 focus:ring-parle-blue-500 focus:border-transparent"
                      />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          data-testid={`step-move-up-${index}`}
                          onClick={() => handleRoadmapStepMove(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move step ${index + 1} up`}
                          className="p-1.5 rounded hover:bg-parle-blue-100 text-parle-navy-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l6 6a1 1 0 01-1.414 1.414L11 6.414V16a1 1 0 11-2 0V6.414l-4.293 4.293a1 1 0 01-1.414-1.414l6-6A1 1 0 0110 3z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          data-testid={`step-move-down-${index}`}
                          onClick={() => handleRoadmapStepMove(index, 1)}
                          disabled={index === roadmapSteps.length - 1}
                          aria-label={`Move step ${index + 1} down`}
                          className="p-1.5 rounded hover:bg-parle-blue-100 text-parle-navy-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 17a1 1 0 01-.707-.293l-6-6a1 1 0 111.414-1.414L9 13.586V4a1 1 0 112 0v9.586l4.293-4.293a1 1 0 111.414 1.414l-6 6A1 1 0 0110 17z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          data-testid={`step-remove-${index}`}
                          onClick={() => handleRoadmapStepRemove(index)}
                          aria-label={`Remove step ${index + 1}`}
                          className="p-1.5 rounded hover:bg-parle-red-50 text-parle-navy-500 hover:text-parle-red-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="roadmap-add-step"
                  onClick={handleRoadmapAddStep}
                  className="mt-2 text-sm text-parle-blue-600 hover:text-parle-blue-700 flex items-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add step
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    onEditScenario();
                  }}
                  className="flex-1 py-3 bg-parle-navy-100 hover:bg-parle-navy-200 text-parle-navy-900 rounded-lg font-medium transition-colors"
                >
                  Edit Description
                </button>
                <button
                  onClick={handleStartPractice}
                  className="flex-1 py-3 bg-parle-blue-500 hover:bg-parle-blue-600 text-white rounded-lg font-medium transition-colors"
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
