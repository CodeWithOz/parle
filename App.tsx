import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Message, ScenarioMode, Scenario, AudioData, Character } from './types';
import { useAudio } from './hooks/useAudio';
import { useDocumentHead } from './hooks/useDocumentHead';
import { initializeSession, sendVoiceMessage, resetSession, setScenario, transcribeAndCleanupAudio } from './services/geminiService';
import { processScenarioDescriptionOpenAI } from './services/openaiService';
import { clearHistory } from './services/conversationHistory';
import { hasApiKeyOrEnv } from './services/apiKeyService';
import { assignVoicesToCharacters } from './services/voiceService';
import { generateId } from './services/scenarioService';
import { Orb } from './components/Orb';
import { Controls } from './components/Controls';
import { ConversationHistory } from './components/ConversationHistory';
import { ScenarioSetup } from './components/ScenarioSetup';
import { ApiKeySetup } from './components/ApiKeySetup';
import { GearIcon } from './components/icons/GearIcon';
import { ConversationHint } from './components/ConversationHint';

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
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [autoPlayMessageId, setAutoPlayMessageId] = useState<number | null>(null);
  const [currentHint, setCurrentHint] = useState<string | null>(null);

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
  const [scenarioCharacters, setScenarioCharacters] = useState<Character[]>([]); // NEW: Characters for scenario

  // Audio retry state - stores last recorded audio for retry on failure
  const [lastChatAudio, setLastChatAudio] = useState<AudioData | null>(null);
  const [lastDescriptionAudio, setLastDescriptionAudio] = useState<AudioData | null>(null);
  const [canRetryChatAudio, setCanRetryChatAudio] = useState(false);
  const [canRetryDescriptionAudio, setCanRetryDescriptionAudio] = useState(false);

  // API Key management state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyCheckDone, setApiKeyCheckDone] = useState(false);

  // Ref to track if we're recording for scenario description
  const scenarioRecordingRef = useRef(false);
  const scenarioSetupOpenRef = useRef(false);

  // Ref to track if processing was aborted by the user
  const processingAbortedRef = useRef(false);
  // AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Error flash state
  const [errorFlashVisible, setErrorFlashVisible] = useState(false);
  const [errorFlashMessage, setErrorFlashMessage] = useState<string>('');

  const hasMessages = messages.length > 0;
  const geminiKeyMissing = apiKeyCheckDone && !hasApiKeyOrEnv('gemini');

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

  // Check for API keys on mount; never show modal on load so user can see the app first
  useEffect(() => {
    const checkApiKeys = async () => {
      setApiKeyCheckDone(true);
      if (hasApiKeyOrEnv('gemini')) {
        try {
          await initializeSession();
        } catch (error) {
          console.error('Failed to initialize Gemini session:', error);
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
    if (!hasApiKeyOrEnv('gemini')) {
      setShowApiKeyModal(true);
      return;
    }
    if (!hasStarted) await handleStartInteraction();

    // Check and request microphone permission before starting
    const hasPermission = await ensureMicrophonePermission();
    if (!hasPermission) {
      return;
    }

    // Clear retry state when starting a new recording
    setCanRetryChatAudio(false);
    setLastChatAudio(null);

    setAppState(AppState.RECORDING);
    await startRecording();
  };

  /**
   * Processes audio data (from recording or retry) and sends it to the AI
   */
  const processAudioMessage = async (audioData: AudioData) => {
    processingAbortedRef.current = false;
    // Create a new AbortController for this request
    abortControllerRef.current = new AbortController();
    setAppState(AppState.PROCESSING);

    try {
      const { base64, mimeType } = audioData;

      // Use Gemini for speaking practice
      const response = await sendVoiceMessage(
        base64,
        mimeType,
        abortControllerRef.current.signal
      );

      // Check if user aborted while waiting for API response
      if (processingAbortedRef.current) {
        if (response.audioUrl) {
          if (Array.isArray(response.audioUrl)) {
            response.audioUrl.forEach(url => URL.revokeObjectURL(url));
          } else {
            URL.revokeObjectURL(response.audioUrl);
          }
        }
        return;
      }

      // Handle multi-character response
      if (Array.isArray(response.audioUrl)) {
        const timestamp = Date.now();
        const userMessage: Message = { role: 'user', text: response.userText, timestamp };

        // Create separate messages for each character
        const modelMessages: Message[] = response.characters!.map((char, idx) => ({
          role: 'model' as const,
          text: (response.modelText as string[])[idx],
          timestamp: timestamp + idx + 1,
          audioUrl: (response.audioUrl as string[])[idx],
          characterId: char.characterId,
          characterName: char.characterName,
          voiceName: char.voiceName,
          hint: idx === response.characters!.length - 1 ? response.hint : undefined
        }));

        const newMessages: Message[] = [...messages, userMessage, ...modelMessages];
        setMessages(newMessages);

        // Update current hint (only in scenario mode, from last character)
        if (scenarioMode === 'practice' && response.hint) {
          setCurrentHint(response.hint);
        }

        // Set the first character message to auto-play (others will auto-play sequentially)
        setAutoPlayMessageId(timestamp + 1);
      } else {
        // Single-character response (original behavior)
        const { audioUrl, userText, modelText, hint } = response;

        // Add messages to history (append for chronological order - newest last)
        const timestamp = Date.now();
        const modelTimestamp = timestamp + 1;
        const newMessages: Message[] = [
          ...messages,
          { role: 'user', text: userText, timestamp },
          { role: 'model', text: modelText as string, timestamp: modelTimestamp, audioUrl: audioUrl as string, hint },
        ];
        setMessages(newMessages);

        // Update current hint (only in scenario mode)
        if (scenarioMode === 'practice' && hint) {
          setCurrentHint(hint);
        }

        // Set the new model message to auto-play
        setAutoPlayMessageId(modelTimestamp);
      }

      // Success - clear retry state
      setCanRetryChatAudio(false);
      setLastChatAudio(null);
      setAppState(AppState.IDLE);

    } catch (error) {
      // If aborted, don't show error
      if (processingAbortedRef.current) {
        return;
      }
      console.error("Interaction failed", error);
      // Enable retry with the stored audio
      setCanRetryChatAudio(true);
      setAppState(AppState.ERROR);
      showErrorFlash();
    } finally {
      // Clean up AbortController
      abortControllerRef.current = null;
    }
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

      // Store the audio for potential retry
      const audioData: AudioData = { base64, mimeType };
      setLastChatAudio(audioData);

      // Process the audio
      await processAudioMessage(audioData);

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

  /**
   * Retry sending the last recorded chat audio
   */
  const handleRetryChatAudio = async () => {
    if (!lastChatAudio) {
      console.error("No audio to retry");
      return;
    }
    await processAudioMessage(lastChatAudio);
  };

  // Abort handler - cancels in-flight processing
  const handleAbortProcessing = useCallback(() => {
    processingAbortedRef.current = true;
    // Abort the in-flight network requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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
          if (Array.isArray(msg.audioUrl)) {
            msg.audioUrl.forEach(url => URL.revokeObjectURL(url));
          } else {
            URL.revokeObjectURL(msg.audioUrl);
          }
        }
      });

      // Clear shared conversation history
      clearHistory();
      // Clear UI messages and hint
      setMessages([]);
      setAutoPlayMessageId(null);
      setCurrentHint(null);
      // Always reset Gemini session when clearing history, preserving scenario if active
      resetSession(activeScenario);
    } catch (error) {
      console.error("Error clearing history:", error);
      // Show error to user
      showErrorFlash();
      // Still clear UI messages even if resetSession fails
      setMessages([]);
      setAutoPlayMessageId(null);
      setCurrentHint(null);
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
    setScenarioCharacters([]); // Clear characters
    setIsRecordingDescription(false);
    setIsTranscribingDescription(false);
    setShowTranscriptOptions(false);
    setRawTranscript(null);
    setCleanedTranscript(null);
    // Clear description retry state
    setCanRetryDescriptionAudio(false);
    setLastDescriptionAudio(null);
    if (scenarioRecordingRef.current) {
      cancelRecording();
      scenarioRecordingRef.current = false;
    }
  };

  const handleStartRecordingDescription = async () => {
    // Scenario creation requires both Gemini (transcription) and OpenAI (planning)
    if (!hasApiKeyOrEnv('gemini') || !hasApiKeyOrEnv('openai')) {
      setShowApiKeyModal(true);
      return;
    }
    try {
      getAudioContext();

      // Check and request microphone permission before starting
      const hasPermission = await ensureMicrophonePermission();
      if (!hasPermission) {
        return;
      }

      // Clear retry state when starting a new recording
      setCanRetryDescriptionAudio(false);
      setLastDescriptionAudio(null);

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

  /**
   * Process description audio (from recording or retry) and transcribe it
   */
  const processDescriptionAudio = async (audioData: AudioData): Promise<void> => {
    setIsTranscribingDescription(true);

    try {
      const { base64, mimeType } = audioData;

      // Single LLM call to transcribe and clean up the audio - using Gemini
      const { rawTranscript: rawText, cleanedTranscript: cleanedText } = await transcribeAndCleanupAudio(base64, mimeType);

      // Modal was closed while transcription was in-flight; discard results
      if (!scenarioSetupOpenRef.current) {
        return;
      }

      setRawTranscript(rawText);
      setCleanedTranscript(cleanedText);

      if (!rawText.trim() || !cleanedText.trim()) {
        showErrorFlash('Transcription was empty. Please try again.');
        // Keep retry available for empty transcription
        setCanRetryDescriptionAudio(true);
        return;
      }

      // Success - clear retry state
      setCanRetryDescriptionAudio(false);
      setLastDescriptionAudio(null);
      setShowTranscriptOptions(true);
    } catch (error) {
      console.error('Error transcribing description:', error);
      if (scenarioSetupOpenRef.current) {
        // Enable retry with the stored audio
        setCanRetryDescriptionAudio(true);
        showErrorFlash('Failed to transcribe audio. Please try again.');
      }
    } finally {
      setIsTranscribingDescription(false);
    }
  };

  const handleStopRecordingDescription = async (): Promise<void> => {
    scenarioRecordingRef.current = false;
    setIsRecordingDescription(false);

    try {
      const { base64, mimeType } = await stopRecording();

      // Store the audio for potential retry
      const audioData: AudioData = { base64, mimeType };
      setLastDescriptionAudio(audioData);

      // Process the audio
      await processDescriptionAudio(audioData);
    } catch (error) {
      console.error('Error stopping recording description:', error);
      if (scenarioSetupOpenRef.current) {
        showErrorFlash('Failed to process recording. Please try again.');
      }
    }
  };

  /**
   * Retry transcribing the last recorded description audio
   */
  const handleRetryDescriptionAudio = async (): Promise<void> => {
    if (!lastDescriptionAudio) {
      console.error("No audio to retry");
      return;
    }
    await processDescriptionAudio(lastDescriptionAudio);
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
    // Scenario creation requires both Gemini (transcription) and OpenAI (planning)
    if (!hasApiKeyOrEnv('gemini') || !hasApiKeyOrEnv('openai')) {
      setShowApiKeyModal(true);
      return;
    }
    setIsProcessingScenario(true);

    try {
      // Use OpenAI for scenario planning (returns JSON with summary and characters)
      const result = await processScenarioDescriptionOpenAI(description);

      // Try to parse as JSON first
      let parsed: { summary: string; characters?: Array<{ name: string; role: string; description?: string }> };
      try {
        parsed = JSON.parse(result);
      } catch (parseError) {
        // If not JSON, treat as plain summary (backward compatibility)
        console.warn('Scenario description response is not JSON, treating as plain text');
        parsed = { summary: result, characters: [] };
      }

      setAiSummary(parsed.summary);

      // Extract and assign voices to characters
      if (parsed.characters && parsed.characters.length > 0) {
        const charactersWithIds = parsed.characters.map((char, idx) => ({
          id: `${generateId()}_${idx}`,
          name: char.name,
          role: char.role,
          description: char.description
        }));

        const charactersWithVoices = assignVoicesToCharacters(charactersWithIds);
        setScenarioCharacters(charactersWithVoices);
      } else {
        // No characters extracted, fallback to single-character mode
        setScenarioCharacters([]);
      }
    } catch (error) {
      console.error('Error processing scenario:', error);
      setAiSummary('I understand your scenario. Ready to begin when you are!');
      setScenarioCharacters([]); // Fallback to single-character
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
        if (Array.isArray(msg.audioUrl)) {
          msg.audioUrl.forEach(url => URL.revokeObjectURL(url));
        } else {
          URL.revokeObjectURL(msg.audioUrl);
        }
      }
    });

    // Reset autoplay state
    setAutoPlayMessageId(null);

    // Clear existing conversation
    clearHistory();
    setMessages([]);

    // Enhance scenario with characters
    // Use scenarioCharacters if available (new scenario), otherwise fall back to scenario.characters (existing scenario)
    const enhancedScenario: Scenario = {
      ...scenario,
      characters: scenarioCharacters.length > 0 ? scenarioCharacters : scenario.characters
    };

    // Set the scenario for both providers
    setActiveScenario(enhancedScenario);
    setScenarioMode('practice');

    // Configure Gemini service with the scenario
    setScenario(enhancedScenario);

    // Close the setup modal
    setScenarioDescription('');
    setScenarioName('');
    setAiSummary(null);
  };

  const handleExitScenario = async () => {
    // Revoke all audio URLs before clearing messages
    messages.forEach(msg => {
      if (msg.audioUrl) {
        if (Array.isArray(msg.audioUrl)) {
          msg.audioUrl.forEach(url => URL.revokeObjectURL(url));
        } else {
          URL.revokeObjectURL(msg.audioUrl);
        }
      }
    });

    // Clear the scenario and characters
    setActiveScenario(null);
    setScenarioMode('none');
    setScenarioCharacters([]);

    // Reset Gemini service to normal mode
    setScenario(null);

    // Clear conversation and hint
    clearHistory();
    setMessages([]);
    setAutoPlayMessageId(null);
    setCurrentHint(null);
  };

  // Status text for the landing view
  const getStatusText = () => {
    if (errorFlashVisible) {
      return <p className="text-red-400 font-medium animate-pulse">{errorFlashMessage}</p>;
    }
    if (appState === AppState.ERROR) {
      return <p className="text-red-400 font-medium animate-pulse">Connection Error. Please try again.</p>;
    }
    if (geminiKeyMissing) {
      return <p className="text-yellow-400 font-medium text-sm">Warning: No Gemini API key configured.</p>;
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
    <div className="min-h-dvh h-dvh bg-slate-900 flex flex-col relative overflow-hidden">

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

          {/* Action Buttons — between status text and footer */}
          <div className="mt-2 flex items-center gap-3">
            {/* Cancel Recording Button */}
            <button
              onClick={handleCancelRecording}
              className={`px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-800/50 border border-slate-700/50 ${appState === AppState.RECORDING ? '' : 'hidden'}`}
              tabIndex={appState === AppState.RECORDING ? 0 : -1}
            >
              Cancel (Esc)
            </button>

            {/* Retry Button - visible when audio processing failed */}
            {canRetryChatAudio && appState === AppState.ERROR && (
              <button
                onClick={handleRetryChatAudio}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors rounded-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Retry
              </button>
            )}
          </div>

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
            {/* Conversation hint - shown in scenario practice when idle or recording; flex-shrink-0 keeps it visible below the scrollable history */}
            <div className="flex-shrink-0">
              <ConversationHint
                hint={currentHint}
                isVisible={scenarioMode === 'practice' && (appState === AppState.IDLE || appState === AppState.RECORDING)}
              />
            </div>
          </main>

          {/* Sticky Footer - orb-mic + controls */}
          <div className="w-full z-20 flex-shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-xl">
            {/* Error flash in footer */}
            {errorFlashVisible && (
              <div className="px-4 py-2 text-center">
                <p className="text-red-400 text-xs font-medium animate-pulse">{errorFlashMessage}</p>
              </div>
            )}

            {/* Retry Button - visible when audio processing failed */}
            {canRetryChatAudio && appState === AppState.ERROR && (
              <div className="px-4 py-2 text-center">
                <button
                  onClick={handleRetryChatAudio}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors rounded-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Retry
                </button>
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
          canRetryDescriptionAudio={canRetryDescriptionAudio}
          onRetryDescriptionAudio={handleRetryDescriptionAudio}
          geminiKeyMissing={apiKeyCheckDone && !hasApiKeyOrEnv('gemini')}
          openaiKeyMissing={apiKeyCheckDone && !hasApiKeyOrEnv('openai')}
          characters={scenarioCharacters}
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
