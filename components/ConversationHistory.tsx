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
    // Cleanup: remove ref when component unmounts
    return () => {
      onAudioRef(null, message.timestamp);
    };
  }, [onAudioRef, message.timestamp]);

  // Auto-play when this message should auto-play
  useEffect(() => {
    if (!autoPlay || !audioRef.current || message.role !== 'model' || !message.audioUrl) {
      return;
    }

    const audio = audioRef.current;
    let canplayHandler: (() => void) | null = null;
    let loadeddataHandler: (() => void) | null = null;

    const playAudio = () => {
      if (audio && audio.readyState >= 2) {
        audio.play().catch(err => {
          console.error("Error auto-playing audio:", err);
        });
      }
    };

    if (audio.readyState >= 2) {
      playAudio();
    } else {
      canplayHandler = () => {
        if (audio && autoPlay) {
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
  }, [autoPlay, message.role, message.audioUrl]);

  return (
    <div
      className={`flex flex-col animate-slide-up ${message.role === 'user' ? 'items-end' : 'items-start'}`}
    >
      <div
        className={`max-w-[85%] min-w-[60%] px-4 py-3 rounded-2xl ${
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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return null;
  }

  // Messages are now in chronological order (oldest first, newest last)
  return (
    <div className="flex flex-col w-full flex-grow min-h-0">
      {/* Clear button header */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className="text-slate-500 text-xs font-medium uppercase tracking-widest">Conversation</span>
        </div>
        <button
          onClick={onClear}
          className="text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-slate-800/50"
          title="Clear conversation history"
        >
          Clear
        </button>
      </div>

      {/* Messages - scrollable area */}
      <div className="flex-grow overflow-y-auto px-4 pb-4 chat-scrollbar">
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
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};
