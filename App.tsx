import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Provider, Message, ScenarioMode, Scenario } from './types';
import { useAudio } from './hooks/useAudio';
import { useDocumentHead } from './hooks/useDocumentHead';
import { initializeSession, sendVoiceMessage, resetSession, setScenario, processScenarioDescription, transcribeAndCleanupAudio } from './services/geminiService';
import { sendVoiceMessageOpenAI, setScenarioOpenAI, processScenarioDescriptionOpenAI, transcribeAndCleanupAudioOpenAI } from './services/openaiService';
import { clearHistory } from './services/conversationHistory';
import { hasAnyApiKey, hasApiKeyOrEnv } from './services/apiKeyService';
import { Orb } from './components/Orb';
import { Controls } from './components/Controls';
import { ConversationHistory } from './components/ConversationHistory';
import { ScenarioSetup } from './components/ScenarioSetup';
import { ApiKeySetup } from './components/ApiKeySetup';
import { GearIcon } from './components/icons/GearIcon';

const App: React.FC = () => {
  // SEO metadata - similar to Next.js metadata export
  useDocumentHead({
    title: 'Parle - Practice Speaking French with AI',
    description: 'Practice French conversation with AI using voice interaction. Learn real-world French with personalized scenarios and receive instant feedback.',
    ogTitle: 'Parle - Practice Speaking French with AI',
    ogDescription: 'Practice French conversation with AI using voice interaction. Learn real-world French with personalized scenarios and receive instant feedback.',
    ogType: 'website',
  });

  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [autoPlayMessageId, setAutoPlayMessageId] = useState<number | null>(null);

  // Scenario mode state
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>('none');
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [scenarioName, setScenarioName] = useState('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isProcessingScenario, setIsProcessingScenario] = useState(false);
  const [isRecordingDescription, setIsRecordingDescription] = useState(false);
  const [isTranscribingDescription, setIsTranscribingDescription] = useState(false);
  const [showTranscriptOptions, setShowTranscriptOptions] = useState(false);
  const [rawTranscript, setRawTranscript] = useState<string | null>(null);
  const [cleanedTranscript, setCleanedTranscript] = useState<string | null>(null);

  // API Key management state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyCheckDone, setApiKeyCheckDone] = useState(false);

  // Ref to track if we're recording for scenario description
  const scenarioRecordingRef = useRef(false);
  const scenarioSetupOpenRef = useRef(false);

  // Ref to track if processing was aborted by the user
  const processingAbortedRef = useRef(false);

  // Error flash state
  const [errorFlashVisible, setErrorFlashVisible] = useState(false);
  const [errorFlashMessage, setErrorFlashMessage] = useState<string>('');

  const hasMessages = messages.length > 0;
  const selectedProviderMissingKey = apiKeyCheckDone && !hasApiKeyOrEnv(provider);

  /**
   * Shows an error flash message that auto-dismisses after 3 seconds
   */
  const showErrorFlash = useCallback((message?: string) => {
    const errorMsg = message || 'An error occurred. Please try again.';
    setErrorFlashMessage(errorMsg);
    setErrorFlashVisible(true);
    setTimeout(() => {
      setErrorFlashVisible(false);
      setErrorFlashMessage('');
    }, 3000);
  }, []);

  const {
    isRecording,
    isPlaying,
    volume,
    startRecording,
    stopRecording,
    cancelRecording,
    getAudioContext,
    checkMicrophonePermission,
    requestMicrophonePermission
  } = useAudio();

  // Check for API keys on mount and show modal if missing
  useEffect(() => {
    const checkApiKeys = async () => {
      if (!hasAnyApiKey()) {
        // No API keys found, show modal
        setShowApiKeyModal(true);
      } else {
        // At least one key exists, mark check as done
        setApiKeyCheckDone(true);
        // Try to initialize Gemini if key is available
        if (hasApiKeyOrEnv('gemini')) {
          try {
            await initializeSession();
          } catch (error) {
            console.error('Failed to initialize Gemini session:', error);
          }
        }
      }
    };
    checkApiKeys();
  }, []);

  // Handle API key save - re-initialize services if needed
  const handleApiKeySave = async () => {
    // Re-initialize Gemini session if Gemini key is now available
    if (hasApiKeyOrEnv('gemini')) {
      try {
        await initializeSession();
      } catch (error) {
        console.error('Failed to re-initialize Gemini session:', error);
      }
    }
    setApiKeyCheckDone(true);
  };

  // Handle API key modal close
  const handleApiKeyModalClose = () => {
    setShowApiKeyModal(false);
    // Mark that user has been offered the chance to enter keys
    setApiKeyCheckDone(true);
  };

  const handleCancelRecording = useCallback(() => {
    if (appState === AppState.RECORDING) {
      cancelRecording();
      setAppState(AppState.IDLE);
    }
  }, [appState, cancelRecording]);

  // Handle Escape key to cancel recording
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && appState === AppState.RECORDING) {
        handleCancelRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [appState, handleCancelRecording]);

  // Handle Playback Speed updates
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  const handleStartInteraction = async () => {
    // Boilerplate to ensure AudioContext is resumed on user gesture
    getAudioContext();
    setHasStarted(true);
  };

  /**
   * Check microphone permission and request if necessary.
   * Returns true if permission is granted, false otherwise.
   */
  const ensureMicrophonePermission = useCallback(async (): Promise<boolean> => {
    const permissionState = await checkMicrophonePermission();

    if (permissionState === 'granted') {
      return true;
    }

    if (permissionState === 'denied') {
      alert('Microphone access has been denied. Please enable microphone access in your browser settings to use voice recording.');
      return false;
    }

    // For 'prompt' or 'unsupported' states, request permission
    const granted = await requestMicrophonePermission();
    if (!granted) {
      alert('Microphone access is required for voice recording. Please allow microphone access and try again.');
      return false;
    }

    return true;
  }, [checkMicrophonePermission, requestMicrophonePermission]);

  const handleStartRecording = async () => {
    if (!hasStarted) await handleStartInteraction();

    // Check and request microphone permission before starting
    const hasPermission = await ensureMicrophonePermission();
    if (!hasPermission) {
      return;
    }

    setAppState(AppState.RECORDING);
    await startRecording();
  };

  const handleStopRecording = async () => {
    processingAbortedRef.current = false;
    setAppState(AppState.PROCESSING);

    try {
      // Destructure base64 and mimeType from the hook
      const { base64, mimeType } = await stopRecording();

      // Check if user aborted while recording was stopping
      if (processingAbortedRef.current) {
        return;
      }

      const response = provider === 'gemini'
        ? await sendVoiceMessage(base64, mimeType)
        : await sendVoiceMessageOpenAI(base64, mimeType);

      // Check if user aborted while waiting for API response
      if (processingAbortedRef.current) {
        if (response.audioUrl) {
          URL.revokeObjectURL(response.audioUrl);
        }
        return;
      }

      const { audioUrl, userText, modelText } = response;

      // Add messages to history (append for chronological order - newest last)
      const timestamp = Date.now();
      const modelTimestamp = timestamp + 1;
      const newMessages: Message[] = [
        ...messages,
        { role: 'user', text: userText, timestamp },
        { role: 'model', text: modelText, timestamp: modelTimestamp, audioUrl },
      ];
      setMessages(newMessages);

      // Set the new model message to auto-play
      setAutoPlayMessageId(modelTimestamp);

      setAppState(AppState.IDLE);

    } catch (error) {
      // If aborted, don't show error
      if (processingAbortedRef.current) {
        return;
      }
      console.error("Interaction failed", error);
      setAppState(AppState.ERROR);
      showErrorFlash();
    }
  };

  // Abort handler - cancels in-flight processing
  const handleAbortProcessing = useCallback(() => {
    processingAbortedRef.current = true;
    setAppState(AppState.IDLE);
  }, []);

  // Orb click handler - toggle recording or abort processing
  const handleOrbClick = () => {
    if (appState === AppState.RECORDING) {
      handleStopRecording();
    } else if (appState === AppState.PROCESSING) {
      handleAbortProcessing();
    } else {
      handleStartRecording();
    }
  };

  const handleClearHistory = async () => {
    try {
      // Revoke all audio URLs before clearing messages
      messages.forEach(msg => {
        if (msg.audioUrl) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });

      // Clear shared conversation history
      clearHistory();
      // Clear UI messages
      setMessages([]);
      setAutoPlayMessageId(null);
      // Always reset Gemini session when clearing history, preserving scenario if active
      resetSession(activeScenario);
    } catch (error) {
      console.error("Error clearing history:", error);
      // Show error to user
      showErrorFlash();
      // Still clear UI messages even if resetSession fails
      setMessages([]);
      setAutoPlayMessageId(null);
    }
  };

  // Scenario mode handlers
  const handleOpenScenarioSetup = () => {
    scenarioSetupOpenRef.current = true;
    setScenarioMode('setup');
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
    setShowTranscriptOptions(false);
    setRawTranscript(null);
    setCleanedTranscript(null);
  };

  const handleCloseScenarioSetup = () => {
    scenarioSetupOpenRef.current = false;
    setScenarioMode('none');
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
    setIsRecordingDescription(false);
    setIsTranscribingDescription(false);
    setShowTranscriptOptions(false);
    setRawTranscript(null);
    setCleanedTranscript(null);
    if (scenarioRecordingRef.current) {
      cancelRecording();
      scenarioRecordingRef.current = false;
    }
  };

  const handleStartRecordingDescription = async () => {
    try {
      getAudioContext();

      // Check and request microphone permission before starting
      const hasPermission = await ensureMicrophonePermission();
      if (!hasPermission) {
        return;
      }

      scenarioRecordingRef.current = true;
      setIsRecordingDescription(true);
      await startRecording();
    } catch (error) {
      console.error('Error starting recording description:', error);
      scenarioRecordingRef.current = false;
      setIsRecordingDescription(false);
      throw error;
    }
  };

  const handleStopRecordingDescription = async (): Promise<void> => {
    scenarioRecordingRef.current = false;
    setIsRecordingDescription(false);
    setIsTranscribingDescription(true);

    try {
      const { base64, mimeType } = await stopRecording();

      // Single LLM call to transcribe and clean up the audio
      const { rawTranscript: rawText, cleanedTranscript: cleanedText } = provider === 'gemini'
        ? await transcribeAndCleanupAudio(base64, mimeType)
        : await transcribeAndCleanupAudioOpenAI(base64, mimeType);

      // Modal was closed while transcription was in-flight; discard results
      if (!scenarioSetupOpenRef.current) {
        return;
      }

      setRawTranscript(rawText);
      setCleanedTranscript(cleanedText);

      if (!rawText.trim() || !cleanedText.trim()) {
        showErrorFlash('Transcription was empty. Please try again.');
        return;
      }

      setShowTranscriptOptions(true);
    } catch (error) {
      console.error('Error transcribing description:', error);
      if (scenarioSetupOpenRef.current) {
        showErrorFlash('Failed to transcribe audio. Please try again.');
      }
    } finally {
      setIsTranscribingDescription(false);
    }
  };

  const handleSelectTranscript = (useCleaned: boolean) => {
    const selectedText = useCleaned ? cleanedTranscript : rawTranscript;
    if (selectedText) {
      setScenarioDescription(selectedText);
    }
    setShowTranscriptOptions(false);
    setRawTranscript(null);
    setCleanedTranscript(null);
  };

  const handleDismissTranscriptOptions = () => {
    setShowTranscriptOptions(false);
    setRawTranscript(null);
    setCleanedTranscript(null);
  };

  const handleCancelRecordingDescription = () => {
    scenarioRecordingRef.current = false;
    setIsRecordingDescription(false);
    cancelRecording();
  };

  const handleSubmitScenarioDescription = async (description: string, name: string) => {
    setIsProcessingScenario(true);

    try {
      const summary = provider === 'gemini'
        ? await processScenarioDescription(description)
        : await processScenarioDescriptionOpenAI(description);

      setAiSummary(summary);
    } catch (error) {
      console.error('Error processing scenario:', error);
      setAiSummary('I understand your scenario. Ready to begin when you are!');
    } finally {
      setIsProcessingScenario(false);
    }
  };

  const handleEditScenario = () => {
    // User wants to edit, clear summary to show form again
    setAiSummary(null);
  };

  const handleStartPractice = async (scenario: Scenario) => {
    // Revoke all audio URLs before clearing messages to prevent memory leaks
    messages.forEach(msg => {
      if (msg.audioUrl) {
        URL.revokeObjectURL(msg.audioUrl);
      }
    });

    // Reset autoplay state
    setAutoPlayMessageId(null);

    // Clear existing conversation
    clearHistory();
    setMessages([]);

    // Set the scenario for both providers
    setActiveScenario(scenario);
    setScenarioMode('practice');

    // Configure the AI services with the scenario
    setScenario(scenario);
    setScenarioOpenAI(scenario);

    // Close the setup modal
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
  };

  const handleExitScenario = async () => {
    // Revoke all audio URLs before clearing messages
    messages.forEach(msg => {
      if (msg.audioUrl) {
        URL.revokeObjectURL(msg.audioUrl);
      }
    });

    // Clear the scenario
    setActiveScenario(null);
    setScenarioMode('none');

    // Reset AI services to normal mode
    setScenario(null);
    setScenarioOpenAI(null);

    // Clear conversation
    clearHistory();
    setMessages([]);
    setAutoPlayMessageId(null);
  };

  // Status text for the landing view
  const getStatusText = () => {
    if (errorFlashVisible) {
      return <p className="text-red-400 font-medium animate-pulse">{errorFlashMessage}</p>;
    }
    if (appState === AppState.ERROR) {
      return <p className="text-red-400 font-medium animate-pulse">Connection Error. Please try again.</p>;
    }
    if (selectedProviderMissingKey) {
      return <p className="text-yellow-400 font-medium text-sm">Warning: No {provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key configured.</p>;
    }
    if (appState === AppState.PROCESSING) {
      return <p className="text-slate-400 font-medium">Thinking...</p>;
    }
    if (appState === AppState.RECORDING) {
      return <p className="text-red-400 font-medium">Listening... Tap to stop</p>;
    }
    if (appState === AppState.PLAYING) {
      return <p className="text-sky-400 font-medium">Speaking...</p>;
    }
    if (appState === AppState.IDLE && hasStarted) {
      return <p className="text-slate-500">Ready. Tap the mic to speak.</p>;
    }
    return <p className="text-slate-500">Tap the mic to start your session.</p>;
  };

  return (
    <div className="h-screen bg-slate-900 flex flex-col relative overflow-hidden">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="w-full p-4 sm:p-6 flex flex-row justify-between items-center z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Parle</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 sm:gap-2 bg-slate-800/50 p-1 rounded-full border border-slate-700/50 backdrop-blur-sm">
            <button
              onClick={() => setProvider('gemini')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all ${provider === 'gemini'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Gemini
            </button>
            <button
              onClick={() => setProvider('openai')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all ${provider === 'openai'
                ? 'bg-green-600 text-white shadow-lg shadow-green-500/20'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              OpenAI
            </button>
          </div>
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-full border border-slate-700/50"
            title="Settings"
            aria-label="Open API settings"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area - switches between landing and chat layouts */}
      {!hasMessages ? (
        /* ============ LANDING VIEW ============ */
        <main className="flex-grow min-h-0 overflow-y-auto flex flex-col items-center w-full max-w-2xl mx-auto px-4 z-10 pb-8">

          {/* Spacer pushes content to bottom; collapses when viewport is short to allow scrolling */}
          <div className="flex-grow"></div>

          {/* Controls (speed + scenario) — above the orb */}
          <Controls
            appState={appState}
            playbackSpeed={playbackSpeed}
            onSpeedChange={handleSpeedChange}
            onCancelRecording={handleCancelRecording}
            scenarioMode={scenarioMode}
            activeScenario={activeScenario}
            onOpenScenarioSetup={handleOpenScenarioSetup}
            onExitScenario={handleExitScenario}
          />

          {/* Orb-Mic — at the bottom, closest to thumb */}
          <div className="mt-8">
            <Orb
              state={appState}
              volume={volume}
              size="large"
              onClick={handleOrbClick}
            />
          </div>

          {/* Status Text — below the orb */}
          <div className="h-8 my-2 text-center">
            {getStatusText()}
          </div>

          {/* Cancel Button — between status text and footer, always reserves space */}
          <button
            onClick={handleCancelRecording}
            className={`mt-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-800/50 border border-slate-700/50 ${appState === AppState.RECORDING ? '' : 'invisible'}`}
            tabIndex={appState === AppState.RECORDING ? 0 : -1}
          >
            Cancel (Esc)
          </button>

          {/* Footer Info */}
          <div className="pt-1 text-center text-slate-600 text-xs">
            <p>Built by <a href="https://www.linkedin.com/in/uchechukwu-ozoemena/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">CodeWithOz</a></p>
          </div>
        </main>
      ) : (
        /* ============ CHAT VIEW ============ */
        <>
          {/* Chat area - fills available space */}
          <main className="flex-grow flex flex-col w-full max-w-2xl mx-auto z-10 min-h-0">
            <ConversationHistory
              messages={messages}
              onClear={handleClearHistory}
              playbackSpeed={playbackSpeed}
              autoPlayMessageId={autoPlayMessageId}
            />
          </main>

          {/* Sticky Footer - orb-mic + controls */}
          <div className="w-full z-20 flex-shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-xl">
            {/* Error flash in footer */}
            {errorFlashVisible && (
              <div className="px-4 py-2 text-center">
                <p className="text-red-400 text-xs font-medium animate-pulse">{errorFlashMessage}</p>
              </div>
            )}

            <div className="max-w-2xl mx-auto px-4 py-3 pb-6 flex items-center gap-3">
              {/* Controls on the left */}
              <div className="flex-grow min-w-0">
                <Controls
                  appState={appState}
                  playbackSpeed={playbackSpeed}
                  onSpeedChange={handleSpeedChange}
                  onCancelRecording={handleCancelRecording}
                  scenarioMode={scenarioMode}
                  activeScenario={activeScenario}
                  onOpenScenarioSetup={handleOpenScenarioSetup}
                  onExitScenario={handleExitScenario}
                  compact
                />
              </div>

              {/* Orb-Mic on the right */}
              <div className="flex-shrink-0">
                <Orb
                  state={appState}
                  volume={volume}
                  size="small"
                  onClick={handleOrbClick}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Scenario Setup Modal */}
      {scenarioMode === 'setup' && (
        <ScenarioSetup
          onStartPractice={handleStartPractice}
          onClose={handleCloseScenarioSetup}
          isRecordingDescription={isRecordingDescription}
          isTranscribingDescription={isTranscribingDescription}
          onStartRecordingDescription={handleStartRecordingDescription}
          onStopRecordingDescription={handleStopRecordingDescription}
          onCancelRecordingDescription={handleCancelRecordingDescription}
          isProcessingScenario={isProcessingScenario}
          aiSummary={aiSummary}
          onSubmitDescription={handleSubmitScenarioDescription}
          onEditScenario={handleEditScenario}
          currentDescription={scenarioDescription}
          currentName={scenarioName}
          onDescriptionChange={setScenarioDescription}
          onNameChange={setScenarioName}
          showTranscriptOptions={showTranscriptOptions}
          rawTranscript={rawTranscript}
          cleanedTranscript={cleanedTranscript}
          onSelectTranscript={handleSelectTranscript}
          onDismissTranscriptOptions={handleDismissTranscriptOptions}
        />
      )}

      {/* API Key Setup Modal */}
      {showApiKeyModal && (
        <ApiKeySetup
          onClose={handleApiKeyModalClose}
          onSave={handleApiKeySave}
        />
      )}
    </div>
  );
};

export default App;
