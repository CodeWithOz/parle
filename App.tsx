import React, { useState, useEffect } from 'react';
import { AppState } from './types';
import { useAudio } from './hooks/useAudio';
import { initializeSession, sendVoiceMessage } from './services/geminiService';
import { Orb } from './components/Orb';
import { Controls } from './components/Controls';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [hasStarted, setHasStarted] = useState(false);
  
  const { 
    isRecording, 
    isPlaying, 
    volume, 
    startRecording, 
    stopRecording, 
    playAudio,
    updatePlaybackSpeed,
    getAudioContext
  } = useAudio();

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []);

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

  const handleStopRecording = async () => {
    setAppState(AppState.PROCESSING);
    
    try {
      // Destructure base64 and mimeType from the hook
      const { base64, mimeType } = await stopRecording();
      
      // Get AudioContext for decoding
      const ctx = getAudioContext();
      
      const responseBuffer = await sendVoiceMessage(base64, mimeType, ctx);
      
      setAppState(AppState.PLAYING);
      playAudio(responseBuffer, playbackSpeed, () => {
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
      <header className="w-full p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">Parle</h1>
        </div>
        <div className="text-xs font-medium px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-slate-400">
          French Practice • Gemini Native Audio
        </div>
      </header>

      {/* Main Visualizer Area */}
      <main className="flex-grow flex flex-col items-center justify-center w-full max-w-2xl px-4 z-10 pb-12">
        
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
        />

      </main>
      
      {/* Footer Info */}
      <footer className="p-4 text-center text-slate-600 text-xs z-10">
        <p>Bilingual Mode: French → English Translation</p>
      </footer>
    </div>
  );
};

export default App;