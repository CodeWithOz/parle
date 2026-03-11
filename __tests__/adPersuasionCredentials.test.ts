/**
 * TDD tests for TEF Ad Persuasion missing-credentials handling.
 *
 * Sections 1–4 cover the service, component, and contract behaviour by
 * exercising real production code and rendering the actual UI.
 * Section 5 contains source-text specs that verify the implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import * as apiKeyService from '../services/apiKeyService';
import * as geminiService from '../services/geminiService';
import { AdPersuasionSetup } from '../components/AdPersuasionSetup';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const noop = () => {};
const sampleConfirmation = { summary: 'A luxury car ad.', roleSummary: 'I will be a skeptical friend.' };

/**
 * Renders AdPersuasionSetup with sensible defaults.  Individual tests
 * override only the props they care about.
 */
function renderSetup(overrides: Partial<React.ComponentProps<typeof AdPersuasionSetup>> = {}) {
  const onStartConversation = vi.fn();
  const onClose = vi.fn();
  const onOpenApiKeyModal = vi.fn();
  const result = render(
    React.createElement(AdPersuasionSetup, {
      onStartConversation,
      onClose,
      geminiKeyMissing: false,
      onOpenApiKeyModal,
      ...overrides,
    })
  );
  return { ...result, onStartConversation, onClose, onOpenApiKeyModal };
}

/**
 * Simulates selecting a file on the hidden file input.
 */
function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

// ---------------------------------------------------------------------------
// 1. apiKeyService — verify hasApiKeyOrEnv is importable and works correctly
// ---------------------------------------------------------------------------

describe('apiKeyService · hasApiKeyOrEnv', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it('is importable from the apiKeyService module', async () => {
    const mod = await import('../services/apiKeyService');
    expect(typeof mod.hasApiKeyOrEnv).toBe('function');
  });

  it('returns false for "gemini" when localStorage is empty and env var is absent', async () => {
    const { hasApiKeyOrEnv } = await import('../services/apiKeyService');
    delete process.env.GEMINI_API_KEY;
    expect(hasApiKeyOrEnv('gemini')).toBe(false);
  });

  it('returns true for "gemini" when a key is stored in localStorage', async () => {
    const { hasApiKeyOrEnv, setApiKey } = await import('../services/apiKeyService');
    setApiKey('gemini', 'test-gemini-key-123');
    expect(hasApiKeyOrEnv('gemini')).toBe(true);
  });

  it('returns true for "gemini" when GEMINI_API_KEY env var is set', async () => {
    const { hasApiKeyOrEnv } = await import('../services/apiKeyService');
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    expect(hasApiKeyOrEnv('gemini')).toBe(true);
    delete process.env.GEMINI_API_KEY;
  });

  it('localStorage key takes precedence over env variable', async () => {
    const { hasApiKeyOrEnv, setApiKey, getApiKeyOrEnv } = await import('../services/apiKeyService');
    process.env.GEMINI_API_KEY = 'env-key';
    setApiKey('gemini', 'stored-key');
    expect(getApiKeyOrEnv('gemini')).toBe('stored-key');
    expect(hasApiKeyOrEnv('gemini')).toBe(true);
    delete process.env.GEMINI_API_KEY;
  });

  it('removing key from localStorage causes hasApiKeyOrEnv to return false (when no env var)', async () => {
    const { hasApiKeyOrEnv, setApiKey } = await import('../services/apiKeyService');
    delete process.env.GEMINI_API_KEY;
    setApiKey('gemini', 'temp-key');
    expect(hasApiKeyOrEnv('gemini')).toBe(true);
    setApiKey('gemini', '');
    expect(hasApiKeyOrEnv('gemini')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. AdPersuasionSetup — renders unconditionally, shows credential warning
// ---------------------------------------------------------------------------

describe('AdPersuasionSetup · renders unconditionally and shows credential warning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the setup modal when geminiKeyMissing is false', () => {
    renderSetup({ geminiKeyMissing: false });
    expect(screen.getByText('Practice Ad Persuasion')).toBeInTheDocument();
  });

  it('renders the setup modal even when geminiKeyMissing is true', () => {
    renderSetup({ geminiKeyMissing: true });
    expect(screen.getByText('Practice Ad Persuasion')).toBeInTheDocument();
  });

  it('shows the warning banner when geminiKeyMissing is true', () => {
    renderSetup({ geminiKeyMissing: true });
    expect(screen.getByText('API Key Required')).toBeInTheDocument();
  });

  it('does NOT show the warning banner when geminiKeyMissing is false', () => {
    renderSetup({ geminiKeyMissing: false });
    expect(screen.queryByText('API Key Required')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2b. processFile · credential gate (rendered AdPersuasionSetup)
// ---------------------------------------------------------------------------

describe('processFile · credential gate', () => {
  const pngFile = new File(['fake-image-data'], 'ad.png', { type: 'image/png' });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onOpenApiKeyModal and does NOT call confirmTefAdImage when key is missing', () => {
    vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(false);
    const confirmSpy = vi.spyOn(geminiService, 'confirmTefAdImage');

    const { onOpenApiKeyModal } = renderSetup();
    selectFile(pngFile);

    expect(onOpenApiKeyModal).toHaveBeenCalledOnce();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('does NOT call onOpenApiKeyModal when key is present', async () => {
    vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
    const confirmSpy = vi.spyOn(geminiService, 'confirmTefAdImage').mockResolvedValue(sampleConfirmation);

    const { onOpenApiKeyModal } = renderSetup();
    selectFile(pngFile);

    // Wait for the full async flow to complete before asserting and cleanup
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });
    expect(onOpenApiKeyModal).not.toHaveBeenCalled();
  });

  it('calls confirmTefAdImage with the base64 data and mimeType when key is present', async () => {
    vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
    const confirmSpy = vi
      .spyOn(geminiService, 'confirmTefAdImage')
      .mockResolvedValue(sampleConfirmation);

    renderSetup();
    selectFile(pngFile);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledOnce();
    });
    const [base64Arg, mimeTypeArg] = confirmSpy.mock.calls[0];
    expect(typeof base64Arg).toBe('string');
    expect(base64Arg.length).toBeGreaterThan(0);
    expect(mimeTypeArg).toBe('image/png');
  });
});

// ---------------------------------------------------------------------------
// 3. handleStartTefConversation — App passes credential gate; component wires
//    onStartConversation correctly once in the confirm step
// ---------------------------------------------------------------------------

describe('AdPersuasionSetup · confirm step fires onStartConversation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function reachConfirmStep() {
    vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
    vi.spyOn(geminiService, 'confirmTefAdImage').mockResolvedValue(sampleConfirmation);

    const props = renderSetup();
    selectFile(new File(['img'], 'ad.png', { type: 'image/png' }));

    // Wait for the component to reach the confirm step
    await waitFor(() => {
      expect(screen.getByText('Start Conversation')).toBeInTheDocument();
    });

    return props;
  }

  it('shows the analyzed ad summary in the confirm step', async () => {
    await reachConfirmStep();
    expect(screen.getByText(sampleConfirmation.summary)).toBeInTheDocument();
    expect(screen.getByText(sampleConfirmation.roleSummary)).toBeInTheDocument();
  });

  it('calls onStartConversation when the Start Conversation button is clicked', async () => {
    const { onStartConversation } = await reachConfirmStep();
    fireEvent.click(screen.getByText('Start Conversation'));
    expect(onStartConversation).toHaveBeenCalledOnce();
  });

  it('does NOT call onStartConversation until Start Conversation is clicked', async () => {
    const { onStartConversation } = await reachConfirmStep();
    // Confirm step is shown but button not yet clicked
    expect(screen.getByText('Start Conversation')).toBeInTheDocument();
    expect(onStartConversation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. TEF Ad uses only Gemini — NOT OpenAI (spec / documentation test)
// ---------------------------------------------------------------------------

describe('TEF Ad Persuasion · provider requirements', () => {
  it('TEF Ad mode requires Gemini (not OpenAI) for image analysis', async () => {
    // confirmTefAdImage lives in geminiService, confirming only Gemini is needed.
    const geminiMod = await import('../services/geminiService');
    expect(typeof geminiMod.confirmTefAdImage).toBe('function');
  });

  it('the credential check for TEF Ad should be gemini-only, unlike scenario setup which needs both', () => {
    // Scenario setup (ScenarioSetup.tsx) checks both geminiKeyMissing AND
    // openaiKeyMissing because it uses Gemini for transcription and OpenAI
    // for planning.  TEF Ad Persuasion only calls Gemini (image analysis +
    // conversation), so the check must be gemini-only.
    // The warning banner in AdPersuasionSetup only references Gemini.
    renderSetup({ geminiKeyMissing: true });
    const banner = screen.getByText('API Key Required');
    expect(banner).toBeInTheDocument();
    // No OpenAI mention in the banner
    expect(screen.queryByText(/openai/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. TDD FAILING SPECS — these must fail until the implementation is updated
// ---------------------------------------------------------------------------

describe('AdPersuasionSetup · credential gate moved to processFile (TDD — must fail before implementation)', () => {
  /**
   * These tests inspect the actual source text of AdPersuasionSetup.tsx and
   * App.tsx to verify the code-review fix has been applied.  They FAIL before
   * the builder makes the changes and PASS once they are in place.
   */

  it('AdPersuasionSetup props interface includes geminiKeyMissing', async () => {
    // Already implemented — should PASS.
    const src = await import('../components/AdPersuasionSetup?raw');
    expect(src.default).toMatch(/geminiKeyMissing/);
  });

  it('AdPersuasionSetup renders a yellow warning banner when geminiKeyMissing is true', async () => {
    // Already implemented — should PASS.
    const src = await import('../components/AdPersuasionSetup?raw');
    expect(src.default).toMatch(/bg-yellow-/);
    expect(src.default).toMatch(/border-yellow-/);
  });

  it('AdPersuasionSetup warning banner mentions Gemini (inside the warning element, not just imports)', async () => {
    // Already implemented — should PASS.
    const src = await import('../components/AdPersuasionSetup?raw');
    expect(src.default).toMatch(/['">][^'"<>]*[Gg]emini[^'"<>]*['"<]/);
  });

  it('handleOpenTefAdSetup in App.tsx does NOT contain a hasApiKeyOrEnv credential guard', async () => {
    // After the fix: the guard is removed from handleOpenTefAdSetup, so the
    // regex match FAILS (i.e., not.toMatch should PASS once guard is removed).
    //
    // Before implementation: handler still has the guard → this test FAILS.
    // After implementation: guard is gone → this test PASSES.
    const src = await import('../App?raw');
    expect(src.default).not.toMatch(
      /handleOpenTefAdSetup[\s\S]{0,300}hasApiKeyOrEnv\(['"]gemini['"]\)/
    );
  });

  it('AdPersuasionSetup source contains hasApiKeyOrEnv("gemini") — the new gate location', async () => {
    // After the fix: processFile in AdPersuasionSetup.tsx checks the key.
    //
    // Before implementation: no such check → FAILS.
    // After implementation: check is present → PASSES.
    const src = await import('../components/AdPersuasionSetup?raw');
    expect(src.default).toMatch(/hasApiKeyOrEnv\(['"]gemini['"]\)/);
  });

  it('handleStartTefConversation in App.tsx guards with hasApiKeyOrEnv("gemini")', async () => {
    // Already implemented — should PASS.
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /handleStartTefConversation[\s\S]{0,400}hasApiKeyOrEnv\(['"]gemini['"]\)/
    );
  });

  it('App.tsx passes onOpenApiKeyModal prop to AdPersuasionSetup', async () => {
    // After the fix: App.tsx must wire up the callback so the component can
    // open the API key modal when processFile detects a missing key.
    //
    // Before implementation: prop is absent → FAILS.
    // After implementation: prop is present → PASSES.
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /<AdPersuasionSetup[\s\S]{0,400}onOpenApiKeyModal=/
    );
  });
});
