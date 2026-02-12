import React, { useRef, useEffect, useCallback } from 'react';
import { Message } from '../types';

interface ConversationHistoryProps {
  messages: Message[];
  onClear: () => void;
  playbackSpeed: number;
  autoPlayMessageId?: number | null;
  onRetryAudio?: (messageTimestamp: number) => void;
}

interface MessageItemProps {
  message: Message;
  playbackSpeed: number;
  autoPlay: boolean;
  onAudioRef: (audio: HTMLAudioElement | null, messageId: number) => void;
  onAudioEnded?: () => void;
  onRetryAudio?: (messageTimestamp: number) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, playbackSpeed, autoPlay, onAudioRef, onAudioEnded, onRetryAudio }) => {
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

  // Add ended event listener to trigger next message
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !onAudioEnded) {
      return;
    }

    const handleEnded = () => {
      onAudioEnded();
    };

    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onAudioEnded]);

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
        {/* Character name for model messages */}
        {message.role === 'model' && message.characterName && (
          <div className="text-xs text-slate-400 font-medium mb-2 flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
            {message.characterName}
          </div>
        )}

        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>

        {/* Audio controls or retry button */}
        {message.role === 'model' && (
          <>
            {message.audioUrl && typeof message.audioUrl === 'string' ? (
              <audio
                ref={audioRef}
                src={message.audioUrl}
                controls
                className="w-full mt-3"
              />
            ) : message.audioGenerationFailed ? (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-yellow-400/80">⚠️ Audio unavailable</span>
                {onRetryAudio && (
                  <button
                    onClick={() => onRetryAudio(message.timestamp)}
                    className="px-2 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded text-slate-300 transition-colors flex items-center gap-1"
                  >
                    <span>🔄</span>
                    <span>Retry</span>
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
      <span className={`text-xs text-slate-500 mt-1 ${message.role === 'user' ? 'mr-1' : 'ml-1'}`}>
        {message.role === 'user' ? 'You' : (message.characterName || 'AI')}
      </span>
    </div>
  );
};

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  messages,
  onClear,
  playbackSpeed,
  autoPlayMessageId,
  onRetryAudio
}) => {
  const audioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const [currentAutoPlayId, setCurrentAutoPlayId] = React.useState<number | null>(null);

  // Sync currentAutoPlayId with prop
  useEffect(() => {
    setCurrentAutoPlayId(autoPlayMessageId ?? null);
  }, [autoPlayMessageId]);

  const handleAudioRef = useCallback((audio: HTMLAudioElement | null, messageId: number) => {
    if (audio) {
      audioElementsRef.current.set(messageId, audio);
    } else {
      audioElementsRef.current.delete(messageId);
    }
  }, []);

  // Handle audio ended - trigger next message if it exists
  const handleAudioEnded = useCallback((messageTimestamp: number) => {
    // Find the message that just ended
    const currentIndex = messages.findIndex(m => m.timestamp === messageTimestamp);
    if (currentIndex === -1) return;

    // Check if next message exists and is a model message
    if (currentIndex + 1 < messages.length) {
      const nextMessage = messages[currentIndex + 1];
      // Only auto-play if next message is from model and has consecutive timestamp
      if (nextMessage.role === 'model' && nextMessage.timestamp === messageTimestamp + 1) {
        setCurrentAutoPlayId(nextMessage.timestamp);
      }
    }
  }, [messages]);

  // Pause all audio except the one that should auto-play
  useEffect(() => {
    audioElementsRef.current.forEach((audio, messageId) => {
      if (messageId !== currentAutoPlayId && !audio.paused) {
        audio.pause();
      }
    });
  }, [currentAutoPlayId]);

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
              autoPlay={currentAutoPlayId === message.timestamp}
              onAudioRef={handleAudioRef}
              onAudioEnded={() => handleAudioEnded(message.timestamp)}
              onRetryAudio={onRetryAudio}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};
