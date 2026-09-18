/**
 * TDD integration tests: clicking a sample-ad thumbnail in either TEF setup
 * screen behaves exactly like selecting a PNG file (key gate, analysis with
 * base64 + 'image/png', confirmation step).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import * as apiKeyService from '../services/apiKeyService';
import * as geminiService from '../services/geminiService';
import { AdPersuasionSetup } from '../components/AdPersuasionSetup';
import { AdQuestioningSetup } from '../components/AdQuestioningSetup';
import { TEF_SAMPLE_ADS } from '../services/tefSampleAds';
import type { TefExerciseType } from '../types';

const confirmation = { summary: 'A sample advertisement.', roleSummary: 'I will be a curious caller.' };
const BYTES = 'fake-image-data';

const fixtures: Array<{
  label: string;
  type: TefExerciseType;
  Component: React.ComponentType<any>;
  serviceFn: 'confirmTefAdImage' | 'confirmTefAdImageForQuestioning';
}> = [
  { label: 'AdPersuasionSetup', type: 'persuasion', Component: AdPersuasionSetup, serviceFn: 'confirmTefAdImage' },
  { label: 'AdQuestioningSetup', type: 'questioning', Component: AdQuestioningSetup, serviceFn: 'confirmTefAdImageForQuestioning' },
];

function renderSetup(Component: React.ComponentType<any>) {
  const onOpenApiKeyModal = vi.fn();
  const utils = render(
    React.createElement(Component, {
      onStartConversation: vi.fn(),
      onStartFromSaved: vi.fn(),
      onTopicsForAd: vi.fn(),
      onDeleteSavedAd: vi.fn(),
      recentAdsRefreshToken: 0,
      onClose: vi.fn(),
      geminiKeyMissing: false,
      onOpenApiKeyModal,
    })
  );
  return { ...utils, onOpenApiKeyModal };
}

function stubFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob([BYTES], { type: 'image/png' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

for (const { label, type, Component, serviceFn } of fixtures) {
  describe(`${label} · sample ads`, () => {
    const ads = TEF_SAMPLE_ADS[type];

    it('shows all 4 sample thumbnails in the initial upload step', () => {
      renderSetup(Component);
      for (const ad of ads) {
        expect(screen.getByRole('button', { name: new RegExp(ad.label) })).toBeInTheDocument();
      }
      // dropzone is still present
      expect(screen.getByRole('button', { name: /upload advertisement image/i })).toBeInTheDocument();
    });

    it('clicking a thumbnail analyses the image as base64 image/png and reaches the confirm step', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      const spy = vi.spyOn(geminiService, serviceFn).mockResolvedValue(confirmation);
      const fetchMock = stubFetchOk();
      renderSetup(Component);

      fireEvent.click(screen.getByRole('button', { name: new RegExp(ads[1].label) }));

      await waitFor(() => expect(screen.getByText('Start Conversation')).toBeInTheDocument());
      expect(fetchMock.mock.calls[0][0]).toBe(ads[1].url);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(btoa(BYTES));
      expect(spy.mock.calls[0][1]).toBe('image/png');
      expect(screen.getByText(confirmation.summary)).toBeInTheDocument();
    });

    it('without a Gemini key: opens the API key modal and does not analyse', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(false);
      const spy = vi.spyOn(geminiService, serviceFn).mockResolvedValue(confirmation);
      stubFetchOk();
      const { onOpenApiKeyModal } = renderSetup(Component);

      fireEvent.click(screen.getByRole('button', { name: new RegExp(ads[0].label) }));

      await waitFor(() => expect(onOpenApiKeyModal).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 30));
      expect(spy).not.toHaveBeenCalled();
      expect(screen.queryByText('Start Conversation')).not.toBeInTheDocument();
    });

    it('when the sample fetch fails: shows an error, does not analyse, stays on upload step', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      const spy = vi.spyOn(geminiService, serviceFn).mockResolvedValue(confirmation);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob([]) }));
      renderSetup(Component);

      fireEvent.click(screen.getByRole('button', { name: new RegExp(ads[0].label) }));

      // Existing setup error UI renders the message in a red <p> (no role=alert).
      await waitFor(() => expect(document.querySelector('p.text-parle-red-700')).not.toBeNull());
      expect(spy).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /upload advertisement image/i })).toBeInTheDocument();
    });

    it('a second thumbnail click during the FileReader gap does not start a second analysis', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      const spy = vi.spyOn(geminiService, serviceFn).mockResolvedValue(confirmation);
      const fetchMock = stubFetchOk();

      const readers: any[] = [];
      class DeferredFileReader {
        onload: ((e: any) => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(file: File) {
          readers.push({ reader: this, file });
        }
      }
      vi.stubGlobal('FileReader', DeferredFileReader);
      renderSetup(Component);

      fireEvent.click(screen.getByRole('button', { name: new RegExp(ads[0].label) }));
      await waitFor(() => expect(readers).toHaveLength(1));

      // Reader has not finished yet: the parent is still on the upload step.
      fireEvent.click(screen.getByRole('button', { name: new RegExp(ads[1].label) }));
      await new Promise((r) => setTimeout(r, 30));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(readers).toHaveLength(1);

      readers[0].reader.onload({ target: { result: `data:image/png;base64,${btoa(BYTES)}` } });
      await waitFor(() => expect(screen.getByText('Start Conversation')).toBeInTheDocument());
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('the gallery is not shown once an image is being confirmed', async () => {
      vi.spyOn(apiKeyService, 'hasApiKeyOrEnv').mockReturnValue(true);
      vi.spyOn(geminiService, serviceFn).mockResolvedValue(confirmation);
      stubFetchOk();
      renderSetup(Component);

      fireEvent.click(screen.getByRole('button', { name: new RegExp(ads[0].label) }));
      await waitFor(() => expect(screen.getByText('Start Conversation')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: new RegExp(ads[0].label) })).not.toBeInTheDocument();
    });
  });
}
