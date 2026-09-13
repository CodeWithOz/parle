/**
 * TDD tests for ScenarioSetup "describe by voice" transcription cancellation.
 *
 * The bug to fix:
 * - Closing ScenarioSetup while transcription is in-flight must abort the request
 * - Aborted/stale transcription results must NOT update state after a close+reopen
 * - Subsequent scenario description recordings must work without being blocked
 *
 * Approach:
 * - Render App and drive the ScenarioSetup modal via UI interactions
 * - Mock useAudio so recording/stop are deterministic (no MediaRecorder / mic)
 * - Mock @google/genai models.generateContent to return deferred promises that
 *   only resolve when the test resolves them
 * - Ensure that after resolving the first (stale) transcription, the UI still
 *   reflects the second in-flight transcription (i.e., no stale overwrite)
 *
 * Tests FAIL before the abort/discard fix is implemented.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jsonResponse } from './helpers/mockParleBff';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';

let transcriptionCalls: Array<{
  deferred: Deferred<Response>;
  abortSignal?: AbortSignal;
}> = [];

let rejectOnAbort = true;

// ---------------------------------------------------------------------------
// Mock Vaul so PracticeModeSheet can be imported without the real library.
// (Some environments don't resolve optional deps during Vitest transforms.)
// ---------------------------------------------------------------------------
vi.mock('vaul', () => {
  const passthrough: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;

  const Root: React.FC<{ open: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }> = ({
    children,
  }) => <>{children}</>;

  const Overlay: React.FC<{ className?: string; children?: React.ReactNode }> = ({ children }) => (
    <>{children}</>
  );

  const Content: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;

  const Title: React.FC<{ asChild?: boolean; children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  const Description: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children }) => <>{children}</>;
  const Handle: React.FC<{ className?: string }> = () => null;

  return {
    Drawer: {
      Root,
      Portal: passthrough,
      Overlay,
      Content,
      Title,
      Description,
      Handle,
    },
  };
});

// ---------------------------------------------------------------------------
// Mock useAudio so recording flows don't touch real browser APIs
// ---------------------------------------------------------------------------
const mockStartRecording = vi.fn().mockResolvedValue(undefined);
const mockStopRecording = vi.fn().mockResolvedValue({
  base64: FAKE_AUDIO_BASE64,
  mimeType: FAKE_MIME_TYPE,
});
const mockCancelRecording = vi.fn();
const mockGetAudioContext = vi.fn();
const mockCheckMicrophonePermission = vi.fn().mockResolvedValue('granted');
const mockRequestMicrophonePermission = vi.fn().mockResolvedValue(true);

vi.mock('../hooks/useAudio', () => {
  return {
    useAudio: () => ({
      isRecording: false,
      isPlaying: false,
      volume: 0,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      cancelRecording: mockCancelRecording,
      getAudioContext: mockGetAudioContext,
      checkMicrophonePermission: mockCheckMicrophonePermission,
      requestMicrophonePermission: mockRequestMicrophonePermission,
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock PracticeModeSheet to avoid Vaul dependency during RTL
// ---------------------------------------------------------------------------
vi.mock('../components/PracticeModeSheet.tsx', () => {
  return {
    PracticeModeSheet: ({
      open,
      onOpenChange,
      onSelectMode,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onSelectMode: (modeId: 'ad-persuasion' | 'role-play' | 'ad-questioning') => void;
    }) => {
      if (!open) return null;
      return (
        <div>
          <button
            type="button"
            data-testid="mode-sheet-role-play"
            onClick={() => {
              onSelectMode('role-play');
              onOpenChange(false);
            }}
          >
            Role Play
          </button>
        </div>
      );
    },
  };
});

beforeAll(() => {
  // ScenarioSetup scrolls transcript options into view; JSDOM doesn't provide it.
  // @ts-expect-error - prototype patch for tests
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
});

describe('ScenarioSetup · describe by voice abort + discard', () => {
  beforeEach(async () => {
    transcriptionCalls = [];
    rejectOnAbort = true;
    const { hydrateSessionStatus } = await import('../services/apiKeyService');
    hydrateSessionStatus({ hasGemini: true, hasOpenai: true, hasApiKey: true });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/session/status')) {
        return jsonResponse({ hasGemini: true, hasOpenai: true, hasApiKey: true });
      }
      if (url.includes('/api/transcribe')) {
        const abortSignal = init?.signal;
        const deferred = createDeferred<Response>();
        transcriptionCalls.push({ deferred, abortSignal });
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            if (rejectOnAbort) {
              deferred.reject(new DOMException('Request aborted', 'AbortError'));
            }
          });
        }
        return deferred.promise;
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }));
    mockStartRecording.mockClear();
    mockStopRecording.mockClear();
    mockCancelRecording.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('aborts in-flight transcription on close and prevents stale results overwriting the next attempt', async () => {
    const { default: App } = await import('../App');
    render(<App />);

    // Open PracticeModeSheet -> Role Play -> ScenarioSetup modal
    fireEvent.click(screen.getByRole('button', { name: /Start Practice/i }));
    // Scoped via data-testid: the app shell's nav rail also exposes a
    // "Role Play" control (French-flag redesign), so an unscoped
    // role/name query is now ambiguous.
    fireEvent.click(await screen.findByTestId('mode-sheet-role-play'));

    await screen.findByText(/Practice Role Play/i);

    // Start first "describe by voice" transcription
    fireEvent.click(screen.getByRole('button', { name: /Or describe by voice/i }));
    await screen.findByRole('button', { name: /Stop Recording/i });
    fireEvent.click(screen.getByRole('button', { name: /Stop Recording/i }));

    await screen.findByText('Transcribing...');
    expect(transcriptionCalls).toHaveLength(1);

    // Close the modal while transcription is still pending
    fireEvent.click(screen.getByLabelText('Close'));

    // With the fix, the first generateContent call must receive an abortSignal and get aborted.
    const firstAbortSignal = transcriptionCalls[0]?.abortSignal;
    expect(firstAbortSignal).toBeDefined();
    expect(firstAbortSignal?.aborted).toBe(true);

    // Re-open ScenarioSetup (second attempt) before resolving the first transcription
    fireEvent.click(screen.getByRole('button', { name: /Start Practice/i }));
    // Scoped via data-testid: the app shell's nav rail also exposes a
    // "Role Play" control (French-flag redesign), so an unscoped
    // role/name query is now ambiguous.
    fireEvent.click(await screen.findByTestId('mode-sheet-role-play'));

    await screen.findByText(/Practice Role Play/i);

    fireEvent.click(screen.getByRole('button', { name: /Or describe by voice/i }));
    await screen.findByRole('button', { name: /Stop Recording/i });
    fireEvent.click(screen.getByRole('button', { name: /Stop Recording/i }));

    await screen.findByText('Transcribing...');
    await waitFor(() => expect(transcriptionCalls).toHaveLength(2));

    const [call1, call2] = transcriptionCalls;

    // Resolve the stale first transcription AFTER the second attempt started.
    // If stale results are not discarded, the UI will switch away from the
    // second transcription spinner and show transcript1 instead.
    await act(async () => {
      call1.deferred.resolve(jsonResponse({ rawTranscript: 'RAW_ONE', cleanedTranscript: 'CLEAN_ONE' }));
    });

    // Second transcription must still be in-flight and must not be overwritten.
    expect(screen.getByText('Transcribing...')).toBeInTheDocument();
    expect(screen.queryByText(/Choose your transcript version/i)).not.toBeInTheDocument();
    expect(screen.queryByText('RAW_ONE')).not.toBeInTheDocument();
    expect(screen.queryByText('CLEAN_ONE')).not.toBeInTheDocument();

    // Resolve the second transcription and ensure only attempt #2 appears.
    await act(async () => {
      call2.deferred.resolve(jsonResponse({ rawTranscript: 'RAW_TWO', cleanedTranscript: 'CLEAN_TWO' }));
    });

    expect(await screen.findByText('RAW_TWO')).toBeInTheDocument();
    expect(screen.getByText('CLEAN_TWO')).toBeInTheDocument();
    expect(screen.queryByText('RAW_ONE')).not.toBeInTheDocument();
  });

  it('invalidates close+reopen without starting a new transcription (late resolve is discarded)', async () => {
    // Simulate a provider that may still resolve after AbortError.
    rejectOnAbort = false;

    const { default: App } = await import('../App');
    render(<App />);

    // Open PracticeModeSheet -> Role Play -> ScenarioSetup modal
    fireEvent.click(screen.getByRole('button', { name: /Start Practice/i }));
    // Scoped via data-testid: the app shell's nav rail also exposes a
    // "Role Play" control (French-flag redesign), so an unscoped
    // role/name query is now ambiguous.
    fireEvent.click(await screen.findByTestId('mode-sheet-role-play'));
    await screen.findByText(/Practice Role Play/i);

    // Start first "describe by voice" transcription
    fireEvent.click(screen.getByRole('button', { name: /Or describe by voice/i }));
    await screen.findByRole('button', { name: /Stop Recording/i });
    fireEvent.click(screen.getByRole('button', { name: /Stop Recording/i }));

    await screen.findByText('Transcribing...');
    await waitFor(() => expect(transcriptionCalls).toHaveLength(1));

    const [call1] = transcriptionCalls;

    // Close the modal while transcription is still pending
    fireEvent.click(screen.getByLabelText('Close'));

    // Re-open ScenarioSetup WITHOUT starting a new transcription
    fireEvent.click(screen.getByRole('button', { name: /Start Practice/i }));
    // Scoped via data-testid: the app shell's nav rail also exposes a
    // "Role Play" control (French-flag redesign), so an unscoped
    // role/name query is now ambiguous.
    fireEvent.click(await screen.findByTestId('mode-sheet-role-play'));
    await screen.findByText(/Practice Role Play/i);

    // Late resolve of the first transcription should not overwrite the reopened modal.
    await act(async () => {
      call1.deferred.resolve(jsonResponse({ rawTranscript: 'RAW_ONE', cleanedTranscript: 'CLEAN_ONE' }));
    });

    expect(screen.queryByText('Transcribing...')).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose your transcript version/i)).not.toBeInTheDocument();
    expect(screen.queryByText('RAW_ONE')).not.toBeInTheDocument();
    expect(screen.queryByText('CLEAN_ONE')).not.toBeInTheDocument();
  });
});

