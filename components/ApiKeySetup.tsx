import React, { useState, useEffect } from 'react';
import { BffError } from '../services/bffClient';
import {
  getCachedSessionStatus,
  refreshSessionStatus,
  revokeKeys,
  saveKeys,
} from '../services/apiKeyService';
import { GearIcon } from './icons/GearIcon';
import { EyeIcon } from './icons/EyeIcon';
import { EyeOffIcon } from './icons/EyeOffIcon';
import { BackupPanel } from './BackupPanel';

interface ApiKeySetupProps {
  onClose: () => void;
  onSave?: () => void;
  onImported?: () => void;
  initialError?: string | null;
}

export const ApiKeySetup: React.FC<ApiKeySetupProps> = ({
  onClose,
  onSave,
  onImported,
  initialError = null,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(getCachedSessionStatus());

  useEffect(() => {
    void refreshSessionStatus().then(setStatus);
  }, []);

  const handleSave = async () => {
    try {
      setError(null);
      setSaving(true);
      const next = await saveKeys({
        geminiApiKey: geminiKey,
        openaiApiKey: openaiKey,
      });
      setStatus(next);
      setGeminiKey('');
      setOpenaiKey('');
      if (onSave) {
        onSave();
      }
      onClose();
    } catch (err) {
      console.error('Error saving API keys:', err);
      if (err instanceof BffError) {
        setError(err.message || 'Could not save your API keys. Please try again.');
      } else {
        setError('Could not save your API keys. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (provider?: 'gemini' | 'openai') => {
    try {
      setError(null);
      const next = await revokeKeys(provider);
      setStatus(next);
      if (onSave) onSave();
    } catch (err) {
      console.error('Error removing API keys:', err);
      setError('Could not remove the saved key. Please try again.');
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-parle-navy-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white border border-parle-navy-100 rounded-2xl w-full max-w-md shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-parle-navy-900 mb-6 flex items-center gap-2">
          <GearIcon className="h-6 w-6 text-parle-blue-500" />
          Settings
        </h2>
        <div className="space-y-6">
          <div>
            <label htmlFor="gemini-key" className="block text-sm font-medium text-parle-navy-700 mb-1">
              Gemini API Key
            </label>
            {status.hasGemini && (
              <p className="text-xs text-parle-navy-500 mb-1">A Gemini key is already saved for this browser.</p>
            )}
            <div className="relative">
              <input
                id="gemini-key"
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={status.hasGemini ? 'Leave blank to keep the saved key' : 'Enter your Gemini API key'}
                autoComplete="off"
                className="w-full bg-white border border-parle-navy-200 rounded-lg pl-4 pr-10 py-2 text-parle-navy-900 text-sm focus:ring-2 focus:ring-parle-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                aria-label={showGeminiKey ? 'Hide Gemini key' : 'Show Gemini key'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-parle-navy-300 hover:text-parle-navy-700 transition-colors"
              >
                {showGeminiKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-parle-blue-600 hover:text-parle-blue-700 inline-block"
              >
                Get a Gemini API Key &rarr;
              </a>
              {status.hasGemini && (
                <button
                  type="button"
                  onClick={() => void handleRevoke('gemini')}
                  className="text-xs text-parle-red-700 hover:underline"
                >
                  Remove Gemini key
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="openai-key" className="block text-sm font-medium text-parle-navy-700 mb-1">
              OpenAI API Key <span className="text-parle-navy-300 text-xs">(Optional)</span>
            </label>
            {status.hasOpenai && (
              <p className="text-xs text-parle-navy-500 mb-1">An OpenAI key is already saved for this browser.</p>
            )}
            <div className="relative">
              <input
                id="openai-key"
                type={showOpenaiKey ? 'text' : 'password'}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={status.hasOpenai ? 'Leave blank to keep the saved key' : 'Enter your OpenAI API key'}
                autoComplete="off"
                className="w-full bg-white border border-parle-navy-200 rounded-lg pl-4 pr-10 py-2 text-parle-navy-900 text-sm focus:ring-2 focus:ring-parle-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                aria-label={showOpenaiKey ? 'Hide OpenAI key' : 'Show OpenAI key'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-parle-navy-300 hover:text-parle-navy-700 transition-colors"
              >
                {showOpenaiKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-parle-blue-600 hover:text-parle-blue-700 inline-block"
              >
                Get an OpenAI API Key &rarr;
              </a>
              {status.hasOpenai && (
                <button
                  type="button"
                  onClick={() => void handleRevoke('openai')}
                  className="text-xs text-parle-red-700 hover:underline"
                >
                  Remove OpenAI key
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-parle-red-50 border border-parle-red-300 rounded-lg">
              <p className="text-xs text-parle-red-700">{error}</p>
            </div>
          )}

          <p className="text-xs text-parle-navy-500 bg-parle-blue-50 p-3 rounded-lg border border-parle-navy-100">
            Keys are encrypted and stored only for this browser profile. Leave a field blank to keep a key you already saved. Saving an empty form does not delete keys — use Remove instead.
          </p>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-parle-navy-100 hover:bg-parle-navy-200 text-parle-navy-900 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-parle-blue-500 hover:bg-parle-blue-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-parle-blue-500/20"
          >
            {saving ? 'Saving…' : 'Save Keys'}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-parle-navy-100">
          <BackupPanel onImported={onImported} />
        </div>
      </div>
    </div>
  );
};
