/**
 * TDD tests for image-upload retry behaviour in TEF setup components.
 *
 * Spec:
 *  1. AUTOMATIC RETRY — transient failures are retried up to 2 times (3 total
 *     attempts) before giving up.
 *  2. ERROR STATE WITH MANUAL RETRY — after all automatic attempts fail the
 *     component enters an error state (NOT the 'upload' step) that:
 *       • keeps the image preview visible
 *       • shows a "Retry" button that re-invokes the confirm service with the
 *         same cached base64 / mimeType
 *       • shows a "Change Image" button that resets back to the upload step
 *  3. HAPPY PATH UNCHANGED — a first-call success calls the service exactly
 *     once and reaches the 'confirm' step.
 *  4. MANUAL RETRY ON SUCCESS — clicking Retry from the error state and
 *     receiving a successful response transitions to 'confirm'.
 *
 * Tests are parameterized over AdPersuasionSetup and AdQuestioningSetup so
 * both components are covered in a single file.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import * as apiKeyService from '../services/apiKeyService';
import * as geminiService from '../services/geminiService';
import { AdPersuasionSetup } from '../components/AdPersuasionSetup';
import { AdQuestioningSetup } from '../components/AdQuestioningSetup';

// ---------------------------------------------------------------------------
// Shared constants & helpers
// ---------------------------------------------------------------------------

const sampleConfirmation = {
  summary: 'A watch advertisement.',
  roleSummary: 'I will be a skeptical friend.',
};

const pngFile = new File(['fake-image-data'], 'ad.png', { type: 'image/png' });

/** Selects a file on the hidden file input rendered by either setup component. */
function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

// ---------------------------------------------------------------------------
// Parameterized suite table
// ---------------------------------------------------------------------------

type ComponentName = 'AdPersuasionSetup' | 'AdQuestioningSetup';

interface ComponentFixture {
  /** Human-readable label for describe blocks */
  label: ComponentName;
  /** The component under test */
  Component: React.ComponentType<{
    onStartConversation: (image: string, mimeType: string, confirmation: { summary: string; roleSummary: string }) => void;
    onClose: () => void;
    geminiKeyMissing?: boolean;
    onOpenApiKeyModal?: () => void;
  }>;
  /** The geminiService function this component calls */
  serviceFn: 'confirmTefAdImage' | 'confirmTefAdImageForQuestioning';
}

const fixtures: ComponentFixture[] = [
  {
    label: 'AdPersuasionSetup',
    Component: AdPersuasionSetup,
    serviceFn: 'confirmTefAdImage',
  },
  {
    label: 'AdQuestioningSetup',
    Component: AdQuestioningSetup,
    serviceFn: 'confirmTefAdImageForQuestioning',
  },
];

// ---------------------------------------------------------------------------
// Helper that renders a component fixture with standard default props.
// ---------------------------------------------------------------------------

function renderFixture(fixture: ComponentFixture) {
  const onStartConversation = vi.fn();
  const onClose = vi.fn();
  const onOpenApiKeyModal = vi.fn();
  const result = render(
    React.createElement(fixture.Component, {
      onStartConversation,
      onClose,
      geminiKeyMissing: false,
      onOpenApiKeyModal,
    })
  );
  return { ...result, onStartConversation, onClose, onOpenApiKeyModal };
}

// ---------------------------------------------------------------------------
// Parameterized tests
// ---------------------------------------------------------------------------

for (const fixture of fixtures) {
  describe(`${fixture.label} · image-analysis retry`, () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Scenario 3 — Happy path: first-call success reaches 'confirm' step
    // -----------------------------------------------------------------------

    it('happy path: calls confirm service exactly once and reaches confirm step on first success', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      const confirmSpy = vi
        .spyOn(geminiService, fixture.serviceFn)
        .mockResolvedValue(sampleConfirmation);

      renderFixture(fixture);
      selectFile(pngFile);

      await waitFor(() => {
        expect(screen.getByText('Start Conversation')).toBeInTheDocument();
      });

      // Service called exactly once — no unnecessary retries on success
      expect(confirmSpy).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Scenario 1 — Automatic retry: 3 total attempts before giving up
    // -----------------------------------------------------------------------

    it('automatic retry: calls confirm service 3 times total when every attempt fails', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      const confirmSpy = vi
        .spyOn(geminiService, fixture.serviceFn)
        .mockRejectedValue(new Error('transient network error'));

      renderFixture(fixture);
      selectFile(pngFile);

      // Wait until the component has exhausted all automatic attempts and
      // surfaced the error state (Retry button must appear).
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      expect(confirmSpy).toHaveBeenCalledTimes(3);
    });

    // -----------------------------------------------------------------------
    // Scenario 2a — Error state: image preview is still visible
    // -----------------------------------------------------------------------

    it('error state: image preview is still rendered after all automatic retries fail', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      vi.spyOn(geminiService, fixture.serviceFn).mockRejectedValue(new Error('fail'));

      renderFixture(fixture);
      selectFile(pngFile);

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      // The image element must still be in the DOM
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Scenario 2b — Error state: upload dropzone is NOT shown (user did not
    // lose their place — the image is preserved, not cleared)
    // -----------------------------------------------------------------------

    it('error state: upload dropzone is NOT shown after all automatic retries fail', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      vi.spyOn(geminiService, fixture.serviceFn).mockRejectedValue(new Error('fail'));

      renderFixture(fixture);
      selectFile(pngFile);

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      // The upload dropzone has this aria-label; it must be gone
      expect(
        screen.queryByRole('button', { name: /upload advertisement image/i })
      ).not.toBeInTheDocument();
    });

    // -----------------------------------------------------------------------
    // Scenario 2c — Error state: "Change Image" button is present
    // -----------------------------------------------------------------------

    it('error state: shows a "Change Image" button that resets to the upload step', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      vi.spyOn(geminiService, fixture.serviceFn).mockRejectedValue(new Error('fail'));

      renderFixture(fixture);
      selectFile(pngFile);

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      const changeImageBtn = screen.getByRole('button', { name: /change image/i });
      expect(changeImageBtn).toBeInTheDocument();

      // Clicking it must restore the upload dropzone
      fireEvent.click(changeImageBtn);
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /upload advertisement image/i })
        ).toBeInTheDocument();
      });
    });

    // -----------------------------------------------------------------------
    // Scenario 2d — Manual Retry: re-invokes service with the same image data
    // -----------------------------------------------------------------------

    it('manual retry: clicking Retry re-invokes the confirm service (same image cached)', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      const confirmSpy = vi
        .spyOn(geminiService, fixture.serviceFn)
        .mockRejectedValue(new Error('fail'));

      renderFixture(fixture);
      selectFile(pngFile);

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      // Reset the mock to track fresh calls from the manual retry
      const callsBeforeManualRetry = confirmSpy.mock.calls.length;

      // Clicking Retry should trigger at least one additional call
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(
        () => {
          expect(confirmSpy.mock.calls.length).toBeGreaterThan(callsBeforeManualRetry);
        },
        { timeout: 10_000 }
      );
    });

    // -----------------------------------------------------------------------
    // Scenario 4 — Manual Retry on success: transitions to 'confirm' step
    // -----------------------------------------------------------------------

    it('manual retry on success: clicking Retry when service resolves reaches confirm step', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);

      // First 3 calls fail (exhausting automatic retries), then the next call
      // (manual retry) succeeds.
      let callCount = 0;
      vi.spyOn(geminiService, fixture.serviceFn).mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) throw new Error('transient fail');
        return sampleConfirmation;
      });

      renderFixture(fixture);
      selectFile(pngFile);

      // Wait for error state to appear
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      // Click Retry — the mock now resolves successfully
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      // Should eventually reach the confirm step
      await waitFor(
        () => {
          expect(screen.getByText('Start Conversation')).toBeInTheDocument();
        },
        { timeout: 10_000 }
      );

      expect(screen.getByText(sampleConfirmation.summary)).toBeInTheDocument();
    });
  });
}
