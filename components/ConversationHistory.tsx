import React, { useRef, useEffect, useCallback } from 'react';
import { Message } from '../types';

interface ConversationHistoryProps {
  messages: Message[];
  onClear: () => void;
  playbackSpeed: number;
  autoPlayMessageId?: number | null;
  isAudioUnlocked?: boolean;
}

interface MessageItemProps {
  message: Message;
  playbackSpeed: number;
  autoPlay: boolean;
  isAudioUnlocked: boolean;
  onAudioRef: (audio: HTMLAudioElement | null, messageId: number) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, playbackSpeed, autoPlay, isAudioUnlocked, onAudioRef }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  // Update playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Register audio element ref
  useEffect(() => {
    onAudioRef(audioRef.current, message.timestamp);
    // Cleanup: remove ref when component unmounts
    return () => {
      onAudioRef(null, message.timestamp);
    };
  }, [onAudioRef, message.timestamp]);

  // Auto-play when this message should auto-play
  // Only attempt autoplay if audio has been unlocked (user has interacted with the page)
  useEffect(() => {
    if (!autoPlay || !audioRef.current || message.role !== 'model' || !message.audioUrl) {
      return;
    }

    // On mobile (especially iOS), audio can only autoplay after user interaction
    // has "unlocked" audio playback. If not unlocked, skip autoplay attempt.
    if (!isAudioUnlocked) {
      console.log('Audio not yet unlocked for autoplay, skipping...');
      return;
    }

    const audio = audioRef.current;
    let canplayHandler: (() => void) | null = null;
    let loadeddataHandler: (() => void) | null = null;

    const playAudio = () => {
      if (audio && audio.readyState >= 2) {
        // Use a play promise with proper error handling for mobile
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            // NotAllowedError is expected on some mobile browsers even with unlock
            // The user can still manually play using the audio controls
            if (err.name === 'NotAllowedError') {
              console.log('Autoplay blocked by browser policy, user can play manually');
            } else {
              console.error("Error auto-playing audio:", err);
            }
          });
        }
      }
    };

    if (audio.readyState >= 2) {
      playAudio();
    } else {
      canplayHandler = () => {
        if (audio && autoPlay && isAudioUnlocked) {
          playAudio();
        }
      };
      loadeddataHandler = playAudio;

      audio.addEventListener('canplay', canplayHandler, { once: true });
      audio.addEventListener('loadeddata', loadeddataHandler, { once: true });
    }

    // Cleanup: remove event listeners
    return () => {
      if (audio && canplayHandler) {
        audio.removeEventListener('canplay', canplayHandler);
      }
      if (audio && loadeddataHandler) {
        audio.removeEventListener('loadeddata', loadeddataHandler);
      }
    };
  }, [autoPlay, isAudioUnlocked, message.role, message.audioUrl]);
  
  return (
    <div
      className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
    >
      <div
        className={`max-w-[85%] px-4 py-3 rounded-2xl ${
          message.role === 'user'
            ? 'bg-blue-600/80 text-white rounded-br-md'
            : 'bg-slate-800/80 text-slate-200 border border-slate-700/50 rounded-bl-md'
        }`}
      >
        <p className="text-sm leading-relaxed">{message.text}</p>
        {message.role === 'model' && message.audioUrl && (
          <audio
            ref={audioRef}
            src={message.audioUrl}
            controls
            className="w-full mt-3"
          />
        )}
      </div>
      <span className={`text-xs text-slate-500 mt-1 ${message.role === 'user' ? 'mr-1' : 'ml-1'}`}>
        {message.role === 'user' ? 'You' : 'AI'}
      </span>
    </div>
  );
};

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  messages,
  onClear,
  playbackSpeed,
  autoPlayMessageId,
  isAudioUnlocked = false
}) => {
  const audioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  
  const handleAudioRef = useCallback((audio: HTMLAudioElement | null, messageId: number) => {
    if (audio) {
      audioElementsRef.current.set(messageId, audio);
    } else {
      audioElementsRef.current.delete(messageId);
    }
  }, []);
  
  // Pause all audio except the one that should auto-play
  useEffect(() => {
    audioElementsRef.current.forEach((audio, messageId) => {
      if (messageId !== autoPlayMessageId && !audio.paused) {
        audio.pause();
      }
    });
  }, [autoPlayMessageId]);
  
  if (messages.length === 0) {
    return null;
  }

  // Messages are already in reverse chronological order (newest first)
  return (
    <div className="w-full max-w-2xl mx-auto px-4 mt-8">
      {/* History Divider */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 h-px bg-slate-700"></div>
        <span className="text-slate-500 text-xs font-medium uppercase tracking-widest">History</span>
        <button
          onClick={onClear}
          className="text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-slate-800/50"
          title="Clear conversation history"
        >
          Clear
        </button>
        <div className="flex-1 h-px bg-slate-700"></div>
      </div>

      {/* Scrollable Messages Container */}
      <div className="max-h-64 overflow-y-auto pr-2 scrollbar-thin">
        <div className="flex flex-col gap-4">
        {messages.map((message, index) => (
          <MessageItem
            key={message.timestamp + '-' + index}
            message={message}
            playbackSpeed={playbackSpeed}
            autoPlay={autoPlayMessageId === message.timestamp}
            isAudioUnlocked={isAudioUnlocked}
            onAudioRef={handleAudioRef}
          />
        ))}
        </div>
      </div>
    </div>
  );
};
