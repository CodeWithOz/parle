import React, { useState, useEffect } from 'react';
import { getApiKey, setApiKey } from '../services/apiKeyService';
import { GearIcon } from './icons/GearIcon';
import { EyeIcon } from './icons/EyeIcon';
import { EyeOffIcon } from './icons/EyeOffIcon';

interface ApiKeySetupProps {
  onClose: () => void;
  onSave?: () => void;
}

export const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onClose, onSave }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill fields with existing keys from localStorage
  useEffect(() => {
    const storedGemini = getApiKey('gemini');
    const storedOpenai = getApiKey('openai');
    if (storedGemini) {
      setGeminiKey(storedGemini);
    }
    if (storedOpenai) {
      setOpenaiKey(storedOpenai);
    }
  }, []);

  const handleSave = () => {
    try {
      setError(null);
      // setApiKey already handles empty strings by removing the key
      setApiKey('gemini', geminiKey);
      setApiKey('openai', openaiKey);

      if (onSave) {
        onSave();
      }
      onClose();
    } catch (error) {
      console.error('Error saving API keys:', error);
      setError('Failed to save API keys. Please try again.');
    }
  };

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.code === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <GearIcon className="h-6 w-6 text-blue-500" />
          API Settings
        </h2>
        <div className="space-y-6">
          {/* Gemini Section */}
          <div>
            <label htmlFor="gemini-key" className="block text-sm font-medium text-slate-300 mb-1">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                id="gemini-key"
                type={showGeminiKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Enter your Gemini API key"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-4 pr-10 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                aria-label={showGeminiKey ? "Hide Gemini key" : "Show Gemini key"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showGeminiKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
            >
              Get a Gemini API Key &rarr;
            </a>
          </div>

          {/* OpenAI Section */}
          <div>
            <label htmlFor="openai-key" className="block text-sm font-medium text-slate-300 mb-1">
              OpenAI API Key <span className="text-slate-500 text-xs">(Optional)</span>
            </label>
            <div className="relative">
              <input
                id="openai-key"
                type={showOpenaiKey ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="Enter your OpenAI API key"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-4 pr-10 py-2 text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                aria-label={showOpenaiKey ? "Hide OpenAI key" : "Show OpenAI key"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showOpenaiKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <a 
              href="https://platform.openai.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-green-400 hover:text-green-300 mt-1 inline-block"
            >
              Get an OpenAI API Key &rarr;
            </a>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <p className="text-xs text-slate-500 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
            Keys are stored locally in your browser. localStorage is vulnerable to{' '}
            <a
              href="https://owasp.org/www-community/attacks/xss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              XSS attacks
            </a>
            . For production, deploy your version of the app from the{' '}
            <a
              href="https://github.com/CodeWithOz/parle"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              source code
            </a>
            {' '}and use environment variables.
          </p>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
};
