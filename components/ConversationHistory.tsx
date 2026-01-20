import React from 'react';
import { Message } from '../types';

interface ConversationHistoryProps {
  messages: Message[];
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({ messages }) => {
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
        <div className="flex-1 h-px bg-slate-700"></div>
      </div>

      {/* Scrollable Messages Container */}
      <div className="max-h-64 overflow-y-auto pr-2 scrollbar-thin">
        <div className="flex flex-col gap-4">
        {messages.map((message, index) => (
          <div
            key={message.timestamp + '-' + index}
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
            </div>
            <span className={`text-xs text-slate-500 mt-1 ${message.role === 'user' ? 'mr-1' : 'ml-1'}`}>
              {message.role === 'user' ? 'You' : 'AI'}
            </span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};
