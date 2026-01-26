import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Provider, Message, ScenarioMode, Scenario } from './types';
import { useAudio } from './hooks/useAudio';
import { useDocumentHead } from './hooks/useDocumentHead';
import { initializeSession, sendVoiceMessage, resetSession, setScenario, processScenarioDescription, transcribeAudio } from './services/geminiService';
import { sendVoiceMessageOpenAI, setScenarioOpenAI, processScenarioDescriptionOpenAI, transcribeAudioOpenAI } from './services/openaiService';
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

  // API Key management state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [hasSkippedApiKeys, setHasSkippedApiKeys] = useState(false);

  // Ref to track if we're recording for scenario description
  const scenarioRecordingRef = useRef(false);

  // Error flash state
  const [errorFlashVisible, setErrorFlashVisible] = useState(false);
  const [errorFlashMessage, setErrorFlashMessage] = useState<string>('');

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
        // At least one key exists, try to initialize Gemini if key is available
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
    setHasSkippedApiKeys(false);
  };

  // Handle API key modal close
  const handleApiKeyModalClose = () => {
    setShowApiKeyModal(false);
    // Update warning state based on current API key availability
    setHasSkippedApiKeys(!hasAnyApiKey());
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
    setScenarioMode('setup');
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
  };

  const handleCloseScenarioSetup = () => {
    setScenarioMode('none');
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
    setIsRecordingDescription(false);
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

  const handleStopRecordingDescription = async (): Promise<string> => {
    scenarioRecordingRef.current = false;
    setIsRecordingDescription(false);

    try {
      const { base64, mimeType } = await stopRecording();

      // Transcribe the audio using the current provider
      const transcription = provider === 'gemini'
        ? await transcribeAudio(base64, mimeType)
        : await transcribeAudioOpenAI(base64, mimeType);

      return transcription;
    } catch (error) {
      console.error('Error transcribing description:', error);
      return scenarioDescription;
    }
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

  const handleStopRecording = async () => {
    setAppState(AppState.PROCESSING);

    try {
      // Destructure base64 and mimeType from the hook
      const { base64, mimeType } = await stopRecording();

      const response = provider === 'gemini'
        ? await sendVoiceMessage(base64, mimeType)
        : await sendVoiceMessageOpenAI(base64, mimeType);

      const { audioUrl, userText, modelText } = response;

      // Add messages to history (prepend for reverse chronological order)
      const timestamp = Date.now();
      const modelTimestamp = timestamp + 1;
      const newMessages: Message[] = [
        { role: 'model', text: modelText, timestamp: modelTimestamp, audioUrl },
        { role: 'user', text: userText, timestamp },
        ...messages
      ];
      setMessages(newMessages);
      
      // Set the new model message to auto-play
      setAutoPlayMessageId(modelTimestamp);

      setAppState(AppState.IDLE);

    } catch (error) {
      console.error("Interaction failed", error);
      setAppState(AppState.ERROR);
      showErrorFlash();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center relative overflow-hidden">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="w-full p-6 flex flex-col sm:flex-row justify-between items-center z-10 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Parle</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-800/50 p-1 rounded-full border border-slate-700/50 backdrop-blur-sm">
            <button
              onClick={() => setProvider('gemini')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${provider === 'gemini'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Gemini
            </button>
            <button
              onClick={() => setProvider('openai')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${provider === 'openai'
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

      {/* Main Visualizer Area */}
      <main className="flex-grow flex flex-col items-center w-full max-w-2xl px-4 z-10 pb-12 pt-8 overflow-y-auto">

        <div className="mb-12 relative">
          <Orb state={appState} volume={volume} />
        </div>

        {/* Status Text */}
        <div className="h-8 mb-8 text-center">
          {errorFlashVisible && (
            <p className="text-red-400 font-medium animate-pulse">{errorFlashMessage}</p>
          )}
          {!errorFlashVisible && appState === AppState.ERROR && (
            <p className="text-red-400 font-medium animate-pulse">Connection Error. Please try again.</p>
          )}
          {!errorFlashVisible && hasSkippedApiKeys && (
            <p className="text-yellow-400 font-medium">Warning: No API keys configured. Core functionality will not work.</p>
          )}
          {!errorFlashVisible && appState === AppState.IDLE && hasStarted && !hasSkippedApiKeys && (
            <p className="text-slate-500">Ready. Press the microphone to speak.</p>
          )}
          {!errorFlashVisible && !hasStarted && !hasSkippedApiKeys && (
            <p className="text-slate-500">Tap the mic to start your session.</p>
          )}
        </div>

        {/* Controls */}
        <Controls
          appState={appState}
          playbackSpeed={playbackSpeed}
          onSpeedChange={handleSpeedChange}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onCancelRecording={handleCancelRecording}
          scenarioMode={scenarioMode}
          activeScenario={activeScenario}
          onOpenScenarioSetup={handleOpenScenarioSetup}
          onExitScenario={handleExitScenario}
        />

        {/* Conversation History */}
        <ConversationHistory 
          messages={messages} 
          onClear={handleClearHistory}
          playbackSpeed={playbackSpeed}
          autoPlayMessageId={autoPlayMessageId}
        />

      </main>

      {/* Footer Info */}
      <footer className="p-4 text-center text-slate-600 text-xs z-10">
        <p>Built by <a href="https://www.linkedin.com/in/uchechukwu-ozoemena/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">CodeWithOz</a></p>
      </footer>

      {/* Scenario Setup Modal */}
      {scenarioMode === 'setup' && (
        <ScenarioSetup
          onStartPractice={handleStartPractice}
          onClose={handleCloseScenarioSetup}
          isRecordingDescription={isRecordingDescription}
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
