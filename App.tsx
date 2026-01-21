import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Provider, Message, ScenarioMode, Scenario } from './types';
import { useAudio } from './hooks/useAudio';
import { initializeSession, sendVoiceMessage, resetSession, setScenario, processScenarioDescription, transcribeAudio } from './services/geminiService';
import { sendVoiceMessageOpenAI, setScenarioOpenAI, processScenarioDescriptionOpenAI, transcribeAudioOpenAI } from './services/openaiService';
import { clearHistory } from './services/conversationHistory';
import { Orb } from './components/Orb';
import { Controls } from './components/Controls';
import { ConversationHistory } from './components/ConversationHistory';
import { ScenarioSetup } from './components/ScenarioSetup';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // Scenario mode state
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>('none');
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [scenarioName, setScenarioName] = useState('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isProcessingScenario, setIsProcessingScenario] = useState(false);
  const [isRecordingDescription, setIsRecordingDescription] = useState(false);

  // Ref to track if we're recording for scenario description
  const scenarioRecordingRef = useRef(false);

  const {
    isRecording,
    isPlaying,
    volume,
    startRecording,
    stopRecording,
    cancelRecording,
    playAudio,
    updatePlaybackSpeed,
    getAudioContext
  } = useAudio();

  // Initialize session on mount (Gemini)
  useEffect(() => {
    initializeSession().catch(console.error);
  }, []);

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
    updatePlaybackSpeed(speed);
  };

  const handleStartInteraction = async () => {
    // Boilerplate to ensure AudioContext is resumed on user gesture
    getAudioContext();
    setHasStarted(true);
  };

  const handleStartRecording = async () => {
    if (!hasStarted) await handleStartInteraction();

    setAppState(AppState.RECORDING);
    await startRecording();
  };

  const handleClearHistory = async () => {
    try {
      // Clear shared conversation history
      clearHistory();
      // Clear UI messages
      setMessages([]);
      // Always reset Gemini session when clearing history, preserving scenario if active
      await resetSession(activeScenario);
    } catch (error) {
      console.error("Error clearing history:", error);
      // Still clear UI messages even if resetSession fails
      setMessages([]);
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
    getAudioContext();
    scenarioRecordingRef.current = true;
    setIsRecordingDescription(true);
    await startRecording();
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

  const handleConfirmScenario = () => {
    // User wants to edit, clear summary to show form again
    setAiSummary(null);
  };

  const handleStartPractice = async (scenario: Scenario) => {
    // Clear existing conversation
    clearHistory();
    setMessages([]);

    // Set the scenario for both providers
    setActiveScenario(scenario);
    setScenarioMode('practice');

    // Configure the AI services with the scenario
    await setScenario(scenario);
    setScenarioOpenAI(scenario);

    // Close the setup modal
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
  };

  const handleExitScenario = async () => {
    // Clear the scenario
    setActiveScenario(null);
    setScenarioMode('none');

    // Reset AI services to normal mode
    await setScenario(null);
    setScenarioOpenAI(null);

    // Clear conversation
    clearHistory();
    setMessages([]);
  };

  const handleStopRecording = async () => {
    setAppState(AppState.PROCESSING);

    try {
      // Destructure base64 and mimeType from the hook
      const { base64, mimeType } = await stopRecording();

      // Get AudioContext for decoding
      const ctx = getAudioContext();

      const response = provider === 'gemini'
        ? await sendVoiceMessage(base64, mimeType, ctx)
        : await sendVoiceMessageOpenAI(base64, mimeType, ctx);

      const { audioBuffer, userText, modelText } = response;

      // Add messages to history (prepend for reverse chronological order)
      const timestamp = Date.now();
      const newMessages: Message[] = [
        { role: 'model', text: modelText, timestamp: timestamp + 1 },
        { role: 'user', text: userText, timestamp },
        ...messages
      ];
      setMessages(newMessages);

      setAppState(AppState.PLAYING);
      playAudio(audioBuffer, playbackSpeed, () => {
        setAppState(AppState.IDLE);
      });

    } catch (error) {
      console.error("Interaction failed", error);
      setAppState(AppState.ERROR);
      // Reset after a delay
      setTimeout(() => setAppState(AppState.IDLE), 3000);
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
      </header>

      {/* Main Visualizer Area */}
      <main className="flex-grow flex flex-col items-center w-full max-w-2xl px-4 z-10 pb-12 pt-8 overflow-y-auto">

        <div className="mb-12 relative">
          <Orb state={appState} volume={volume} />
        </div>

        {/* Status Text */}
        <div className="h-8 mb-8 text-center">
          {appState === AppState.ERROR && (
            <p className="text-red-400 font-medium animate-pulse">Connection Error. Please try again.</p>
          )}
          {appState === AppState.IDLE && hasStarted && (
            <p className="text-slate-500">Ready. Press the microphone to speak.</p>
          )}
          {!hasStarted && (
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
        <ConversationHistory messages={messages} onClear={handleClearHistory} />

      </main>

      {/* Footer Info */}
      <footer className="p-4 text-center text-slate-600 text-xs z-10">
        <p>Bilingual Mode: French → English Translation</p>
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
          onConfirmScenario={handleConfirmScenario}
          currentDescription={scenarioDescription}
          currentName={scenarioName}
          onDescriptionChange={setScenarioDescription}
          onNameChange={setScenarioName}
        />
      )}
    </div>
  );
};

export default App;
