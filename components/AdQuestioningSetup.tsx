import React, { useState, useRef, useCallback } from 'react';
import { confirmTefAdImageForQuestioning } from '../services/geminiService';
import { hasApiKeyOrEnv } from '../services/apiKeyService';

interface AdQuestioningSetupProps {
  onStartConversation: (
    image: string,
    mimeType: string,
    confirmation: { summary: string; roleSummary: string }
  ) => void;
  onClose: () => void;
  geminiKeyMissing?: boolean;
  onOpenApiKeyModal?: () => void;
}

type SetupStep = 'upload' | 'processing' | 'confirm';

export const AdQuestioningSetup: React.FC<AdQuestioningSetupProps> = ({
  onStartConversation,
  onClose,
  geminiKeyMissing = false,
  onOpenApiKeyModal,
}) => {
  const [step, setStep] = useState<SetupStep>('upload');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ summary: string; roleSummary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setError('Unsupported file type. Please use JPEG, PNG, WEBP, HEIC, or HEIF.');
      return;
    }

    // Credential gate: must check BEFORE reading file or mutating state
    if (!hasApiKeyOrEnv('gemini')) {
      onOpenApiKeyModal?.();
      return;
    }

    setError(null);

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl !== 'string') {
        setError('Failed to read the image file. Please try again.');
        setStep('upload');
        return;
      }
      // Extract base64 from data URL (remove "data:image/xxx;base64," prefix)
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type;

      setImageDataUrl(dataUrl);
      setImageBase64(base64);
      setImageMimeType(mimeType);
      setStep('processing');

      try {
        const result = await confirmTefAdImageForQuestioning(base64, mimeType);
        setConfirmation(result);
        setStep('confirm');
      } catch (err) {
        console.error('Error analyzing image:', err);
        setError('Failed to analyze the advertisement. Please try again.');
        setStep('upload');
      }
    };

    reader.onerror = () => {
      setError('Failed to read the image file. Please try again.');
      setStep('upload');
    };

    reader.readAsDataURL(file);
  }, [onOpenApiKeyModal]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input value so the same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleChangeImage = () => {
    setStep('upload');
    setImageDataUrl(null);
    setImageBase64(null);
    setImageMimeType(null);
    setConfirmation(null);
    setError(null);
  };

  const handleStart = () => {
    if (imageDataUrl && imageMimeType && imageBase64 && confirmation) {
      onStartConversation(imageDataUrl, imageMimeType, confirmation);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-slate-100">Practice Ad Questioning</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Warning for missing API key */}
        {geminiKeyMissing && (
          <div className="mx-6 mt-4 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-yellow-400 mb-1">API Key Required</h3>
                <p className="text-sm text-yellow-200/90">
                  Gemini API key is required for analyzing the advertisement image and powering the conversation.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <>
              <p className="text-slate-400 text-sm">
                Upload a French advertisement image. The AI will analyze it and play the role of a customer service agent you must question about the product, as if calling customer service.
              </p>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-600/50 rounded-lg">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Dropzone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload advertisement image"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDragging
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-slate-600 hover:border-slate-500 bg-slate-700/30 hover:bg-slate-700/50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-slate-300 font-medium mb-1">Click or drag an image here</p>
                <p className="text-slate-500 text-sm">PNG, JPG, WEBP, HEIC, HEIF supported</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Select advertisement image"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
              >
                Select Image
              </button>
            </>
          )}

          {/* Step 2: Processing */}
          {step === 'processing' && (
            <div className="flex flex-col items-center gap-6 py-4">
              {imageDataUrl && (
                <img
                  src={imageDataUrl}
                  alt="Advertisement being analyzed"
                  className="w-24 h-24 object-cover rounded-xl border border-slate-600"
                />
              )}
              <div className="flex items-center gap-3">
                <svg className="animate-spin h-6 w-6 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-slate-300 font-medium">Analyzing the advertisement...</p>
              </div>
              <p className="text-slate-500 text-sm text-center">
                The AI is reading your ad to prepare for the conversation.
              </p>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && confirmation && (
            <>
              <div className="flex items-start gap-4">
                {imageDataUrl && (
                  <img
                    src={imageDataUrl}
                    alt="Advertisement"
                    className="w-20 h-20 object-cover rounded-xl border border-slate-600 flex-shrink-0"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-400 text-sm font-medium">Ad Analyzed</span>
                  </div>
                  <p className="text-slate-300 text-sm">{confirmation.summary}</p>
                </div>
              </div>

              <div className="p-4 bg-slate-700/50 rounded-xl border border-slate-600">
                <p className="text-slate-400 text-xs uppercase tracking-wider font-medium mb-2">AI Role Confirmation</p>
                <p className="text-slate-300 text-sm">{confirmation.roleSummary}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleChangeImage}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors"
                >
                  Change Image
                </button>
                <button
                  onClick={handleStart}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
                >
                  Start Conversation
                </button>
              </div>

              <p className="text-slate-500 text-xs text-center">
                Timer starts when you click Start Conversation
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
