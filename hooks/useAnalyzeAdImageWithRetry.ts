import { useState, useRef, useCallback, useEffect } from 'react';

type SetupStep = 'upload' | 'processing' | 'confirm' | 'error';

type ConfirmResult = { summary: string; roleSummary: string };

type ServiceFn = (base64: string, mimeType: string) => Promise<ConfirmResult>;

export function useAnalyzeAdImageWithRetry(serviceFn: ServiceFn) {
  const [step, setStep] = useState<SetupStep>('upload');
  const [confirmation, setConfirmation] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const analyze = useCallback(async (base64: string, mimeType: string) => {
    const MAX_ATTEMPTS = 3;
    const DELAYS = [300, 900];

    generationRef.current += 1;
    const myGen = generationRef.current;

    setStep('processing');

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (!mountedRef.current) return;
      try {
        const result = await serviceFn(base64, mimeType);
        if (generationRef.current !== myGen) return;
        if (!mountedRef.current) return;
        setConfirmation(result);
        setStep('confirm');
        return;
      } catch (err) {
        console.error(`Error analyzing image (attempt ${attempt + 1}):`, err);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, DELAYS[attempt]));
          if (generationRef.current !== myGen) return;
        }
      }
    }

    if (!mountedRef.current) return;
    if (generationRef.current !== myGen) return;
    setError('Failed to analyze the advertisement. Please try again.');
    setStep('error');
  }, [serviceFn]);

  return { step, setStep, confirmation, setConfirmation, error, setError, analyze };
}
