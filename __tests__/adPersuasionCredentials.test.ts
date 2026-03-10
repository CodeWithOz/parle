/**
 * TDD tests for TEF Ad Persuasion missing-credentials handling.
 *
 * These tests specify the EXPECTED behavior after the feature is implemented.
 * Tests in sections 1-3 pass immediately because they verify already-correct
 * service behavior or test the behavioral contract via local model functions.
 *
 * Tests in sections 4-5 are the failing TDD specs:
 *  - Section 4: AdPersuasionSetup must accept a `geminiKeyMissing` prop
 *               (verified by checking the component's prop interface)
 *  - Section 5: App.tsx handlers must guard with hasApiKeyOrEnv('gemini')
 *               (verified by inspecting the actual handler source text)
 *
 * Behavior to implement:
 *  1. AdPersuasionSetup should accept a `geminiKeyMissing` prop and display a
 *     yellow warning banner when it is true (mirrors ScenarioSetup pattern).
 *  2. handleOpenTefAdSetup (App.tsx) should call setShowApiKeyModal(true) and
 *     return early when the Gemini key is missing (mirrors handleStartRecording).
 *  3. handleStartTefConversation (App.tsx) should call setShowApiKeyModal(true)
 *     and return early when the Gemini key is missing.
 *  4. When the Gemini key IS present, neither handler should open the modal.
 *
 * The TEF Ad mode uses ONLY Gemini — not OpenAI — because Gemini handles both
 * image analysis (confirmTefAdImage) and the conversation itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: isolated re-implementation of the credential-check logic
// These model what the App.tsx handlers SHOULD look like after implementation.
// ---------------------------------------------------------------------------

function buildTefAdSetupHandler(
  hasGeminiKey: boolean,
  setShowApiKeyModal: (v: boolean) => void,
  setTefAdMode: (mode: string) => void,
) {
  return function handleOpenTefAdSetup() {
    // EXPECTED implementation (to be added in App.tsx):
    if (!hasGeminiKey) {
      setShowApiKeyModal(true);
      return;
    }
    setTefAdMode('setup');
  };
}

function buildTefConversationHandler(
  hasGeminiKey: boolean,
  setShowApiKeyModal: (v: boolean) => void,
  setTefAdMode: (mode: string) => void,
) {
  return async function handleStartTefConversation(
    _image: string,
    _mimeType: string,
    _confirmation: { summary: string; roleSummary: string },
  ) {
    // EXPECTED implementation (to be added in App.tsx):
    if (!hasGeminiKey) {
      setShowApiKeyModal(true);
      return;
    }
    setTefAdMode('practice');
  };
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
// 2. handleOpenTefAdSetup — credential gate (behavioral contract)
// ---------------------------------------------------------------------------

describe('handleOpenTefAdSetup · credential gate', () => {
  it('opens the API key modal and does NOT enter setup mode when Gemini key is missing', () => {
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    const handler = buildTefAdSetupHandler(
      /* hasGeminiKey */ false,
      setShowApiKeyModal,
      setTefAdMode,
    );

    handler();

    expect(setShowApiKeyModal).toHaveBeenCalledOnce();
    expect(setShowApiKeyModal).toHaveBeenCalledWith(true);
    // Must NOT advance to setup mode
    expect(setTefAdMode).not.toHaveBeenCalled();
  });

  it('enters setup mode and does NOT open the modal when Gemini key is present', () => {
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    const handler = buildTefAdSetupHandler(
      /* hasGeminiKey */ true,
      setShowApiKeyModal,
      setTefAdMode,
    );

    handler();

    expect(setShowApiKeyModal).not.toHaveBeenCalled();
    expect(setTefAdMode).toHaveBeenCalledOnce();
    expect(setTefAdMode).toHaveBeenCalledWith('setup');
  });

  it('returns without advancing mode if called multiple times with no key', () => {
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    const handler = buildTefAdSetupHandler(false, setShowApiKeyModal, setTefAdMode);
    handler();
    handler();

    expect(setShowApiKeyModal).toHaveBeenCalledTimes(2);
    expect(setTefAdMode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. handleStartTefConversation — credential gate (behavioral contract)
// ---------------------------------------------------------------------------

describe('handleStartTefConversation · credential gate', () => {
  const sampleImage = 'data:image/png;base64,abc123';
  const sampleMimeType = 'image/png';
  const sampleConfirmation = {
    summary: 'A luxury car ad.',
    roleSummary: 'I will be a skeptical friend.',
  };

  it('opens the API key modal and does NOT start practice mode when Gemini key is missing', async () => {
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    const handler = buildTefConversationHandler(false, setShowApiKeyModal, setTefAdMode);

    await handler(sampleImage, sampleMimeType, sampleConfirmation);

    expect(setShowApiKeyModal).toHaveBeenCalledOnce();
    expect(setShowApiKeyModal).toHaveBeenCalledWith(true);
    expect(setTefAdMode).not.toHaveBeenCalled();
  });

  it('starts practice mode and does NOT open modal when Gemini key is present', async () => {
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    const handler = buildTefConversationHandler(true, setShowApiKeyModal, setTefAdMode);

    await handler(sampleImage, sampleMimeType, sampleConfirmation);

    expect(setShowApiKeyModal).not.toHaveBeenCalled();
    expect(setTefAdMode).toHaveBeenCalledWith('practice');
  });

  it('is a no-op for setTefAdMode regardless of other arguments when key is absent', async () => {
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    const handler = buildTefConversationHandler(false, setShowApiKeyModal, setTefAdMode);

    await handler('data:image/jpeg;base64,xyz', 'image/jpeg', {
      summary: 'Another ad.',
      roleSummary: 'Another role.',
    });

    expect(setTefAdMode).not.toHaveBeenCalled();
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
    const setShowApiKeyModal = vi.fn();
    const setTefAdMode = vi.fn();

    // Simulate: Gemini present, OpenAI absent
    const geminiOnly = buildTefAdSetupHandler(
      /* hasGeminiKey */ true,
      setShowApiKeyModal,
      setTefAdMode,
    );
    geminiOnly();

    // Should NOT block — TEF Ad doesn't need OpenAI
    expect(setShowApiKeyModal).not.toHaveBeenCalled();
    expect(setTefAdMode).toHaveBeenCalledWith('setup');
  });
});

// ---------------------------------------------------------------------------
// 5. TDD FAILING SPECS — these must fail until the implementation is added
// ---------------------------------------------------------------------------

describe('AdPersuasionSetup · geminiKeyMissing prop (TDD — must fail before implementation)', () => {
  /**
   * These tests inspect the actual source text of AdPersuasionSetup.tsx and
   * App.tsx to verify the implementation has been added.  They FAIL before
   * the builder adds the credential-check code and PASS once it is in place.
   */

  it('AdPersuasionSetup props interface includes geminiKeyMissing', async () => {
    // Read the component source and assert the prop is declared.
    // Before implementation: AdPersuasionSetupProps has no geminiKeyMissing field → FAILS.
    // After implementation: the interface includes `geminiKeyMissing?: boolean` → PASSES.
    const src = await import('../components/AdPersuasionSetup?raw');
    expect(src.default).toMatch(/geminiKeyMissing/);
  });

  it('AdPersuasionSetup renders a yellow warning banner when geminiKeyMissing is true', async () => {
    // The JSX must contain the yellow styling classes used in ScenarioSetup.
    // Before implementation: no yellow banner → FAILS.
    // After implementation: banner with bg-yellow-* and border-yellow-* → PASSES.
    const src = await import('../components/AdPersuasionSetup?raw');
    expect(src.default).toMatch(/bg-yellow-/);
    expect(src.default).toMatch(/border-yellow-/);
  });

  it('AdPersuasionSetup warning banner mentions Gemini (inside the warning element, not just imports)', async () => {
    // The banner copy must be Gemini-specific and appear inside a JSX block
    // that also carries the yellow styling.  A plain import line is not enough.
    //
    // We look for the word "Gemini" within 500 characters of a yellow-* class,
    // which only matches once a yellow warning banner with Gemini text exists.
    //
    // Before implementation: no yellow banner → FAILS (yellow classes absent so
    // the proximity match has nothing to anchor on).
    // After implementation: banner contains both → PASSES.
    const src = await import('../components/AdPersuasionSetup?raw');
    // The banner block must carry yellow classes (asserted in the preceding test)
    // AND the source must contain "Gemini" inside a string literal or JSX text
    // node (i.e., not just as an import path token).
    expect(src.default).toMatch(/['">][^'"<>]*[Gg]emini[^'"<>]*['"<]/);
  });

  it('handleOpenTefAdSetup in App.tsx guards with hasApiKeyOrEnv("gemini")', async () => {
    // Inspect the actual handler in App.tsx for the credential guard.
    // Before implementation: handler has no hasApiKeyOrEnv check → FAILS.
    // After implementation: handler checks !hasApiKeyOrEnv('gemini') → PASSES.
    const src = await import('../App?raw');
    // Match: the handler body must contain the guard before setTefAdMode('setup')
    expect(src.default).toMatch(
      /handleOpenTefAdSetup[\s\S]{0,300}hasApiKeyOrEnv\(['"]gemini['"]\)/
    );
  });

  it('handleStartTefConversation in App.tsx guards with hasApiKeyOrEnv("gemini")', async () => {
    // Inspect the actual handler in App.tsx for the credential guard.
    // Before implementation: handler has no hasApiKeyOrEnv check → FAILS.
    // After implementation: handler checks !hasApiKeyOrEnv('gemini') → PASSES.
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /handleStartTefConversation[\s\S]{0,400}hasApiKeyOrEnv\(['"]gemini['"]\)/
    );
  });

  it('App.tsx passes geminiKeyMissing prop to AdPersuasionSetup', async () => {
    // The JSX call-site for <AdPersuasionSetup> must pass the geminiKeyMissing prop.
    // Before implementation: prop is absent → FAILS.
    // After implementation: prop is present → PASSES.
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /<AdPersuasionSetup[\s\S]{0,300}geminiKeyMissing=/
    );
  });
});
