import React, { useRef, useEffect, useCallback } from 'react';
import { Message } from '../types';

interface ConversationHistoryProps {
  messages: Message[];
  onClear: () => void;
  playbackSpeed: number;
  autoPlayMessageId?: number | null;
}

interface MessageItemProps {
  message: Message;
  playbackSpeed: number;
  autoPlay: boolean;
  onAudioRef: (audio: HTMLAudioElement | null, messageId: number) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, playbackSpeed, autoPlay, onAudioRef }) => {
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
  }, [onAudioRef, message.timestamp]);
  
  // Auto-play when this message should auto-play
  useEffect(() => {
    if (autoPlay && audioRef.current && message.role === 'model' && message.audioUrl) {
      // Wait for audio to be ready, then play
      const playAudio = () => {
        if (audioRef.current && audioRef.current.readyState >= 2) {
          audioRef.current.play().catch(err => {
            console.error("Error auto-playing audio:", err);
          });
        } else if (audioRef.current) {
          // Wait for canplay event
          audioRef.current.addEventListener('canplay', () => {
            if (audioRef.current && autoPlay) {
              audioRef.current.play().catch(err => {
                console.error("Error auto-playing audio:", err);
              });
            }
          }, { once: true });
        }
      };
      
      if (audioRef.current.readyState >= 2) {
        playAudio();
      } else {
        audioRef.current.addEventListener('loadeddata', playAudio, { once: true });
      }
    }
  }, [autoPlay, message.role, message.audioUrl]);
  
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
  autoPlayMessageId
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
            onAudioRef={handleAudioRef}
          />
        ))}
        </div>
      </div>
    </div>
  );
};
