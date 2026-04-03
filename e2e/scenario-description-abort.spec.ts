import { test, expect } from '@playwright/test';

test.describe('ScenarioSetup · describe by voice abort/discard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Provide dummy API keys so the app doesn't block with the API key modal.
      try {
        localStorage.setItem('parle_api_key_gemini', 'test-e2e-gemini');
        localStorage.setItem('parle_api_key_openai', 'test-e2e-openai');
      } catch {
        // Ignore localStorage failures (shouldn't happen in real browser contexts)
      }

      // ---- Stub microphone/audio recording ----
      // The ScenarioSetup "describe by voice" flow depends on Web Audio + MediaRecorder.
      // In CI/headless Playwright we stub these so the UI can progress deterministically.
      const fakeStream = {
        getTracks: () => [{ stop: () => {} }],
      };

      if (!navigator.mediaDevices) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).mediaDevices = {};
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.mediaDevices as any).getUserMedia = async () => fakeStream;

      // Minimal Web Audio API shim used by `useAudio`.
      class FakeAudioContext {
        state: 'running' | 'suspended' = 'running';
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor() {}
        resume() {
          this.state = 'running';
          return Promise.resolve();
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        createMediaStreamSource(_stream: any) {
          return { connect: () => {} };
        }
        createAnalyser() {
          return {
            fftSize: 256,
            frequencyBinCount: 128,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            getByteFrequencyData: (arr: Uint8Array) => {
              for (let i = 0; i < arr.length; i++) arr[i] = 0;
            },
          };
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AudioContext = FakeAudioContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext = FakeAudioContext;

      // Minimal MediaRecorder shim used by `useAudio`.
      class FakeMediaRecorder {
        mimeType = 'audio/webm';
        stream: any;
        state: 'inactive' | 'recording' = 'inactive';
        ondataavailable: null | ((event: { data: Blob }) => void) = null;
        onstop: null | ((event?: any) => void) = null;

        constructor(stream: any) {
          this.stream = stream;
        }

        start() {
          this.state = 'recording';
          if (this.ondataavailable) {
            // Provide a non-empty Blob so blobToBase64 produces deterministic output.
            const data = new Uint8Array([1, 2, 3]);
            const blob = new Blob([data], { type: this.mimeType });
            this.ondataavailable({ data: blob });
          }
        }

        stop() {
          this.state = 'inactive';
          // Only call onstop if someone registered a handler (the app registers onstop
          // only for `stopRecording`, not for `cancelRecording`).
          if (this.onstop) this.onstop({});
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).MediaRecorder = FakeMediaRecorder;
    });

    await page.goto('/');
  });

  test('closing while transcription is in-flight discards stale transcript', async ({ page }) => {
    const screenshot = async (name: string) => {
      await page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
    };

    type PendingRoute = { route: any; fulfilled: boolean };

    const transcriptionResponses: PendingRoute[] = [];
    let transcriptionCallIndex = 0;
    let resolveCall1!: () => void;
    let resolveCall2!: () => void;

    const call1Arrived = new Promise<void>(r => {
      resolveCall1 = r;
    });
    const call2Arrived = new Promise<void>(r => {
      resolveCall2 = r;
    });

    // Intercept Gemini transcription calls and keep the first/second attempts pending
    // until the test explicitly resolves them.
    await page.route('**/models/gemini-2.0-flash-lite:generateContent*', async route => {
      const req = route.request();
      let bodyJson: any = null;
      try {
        bodyJson = req.postDataJSON();
      } catch {
        bodyJson = null;
      }

      const bodyStr = bodyJson ? JSON.stringify(bodyJson) : '';
      const looksLikeScenarioTranscription =
        bodyStr.includes('produce two versions of the transcript') ||
        bodyStr.includes('Transcribe this audio exactly as spoken');

      if (!looksLikeScenarioTranscription) {
        // We only expect scenario transcription calls in this test.
        await route.fallback();
        return;
      }

      transcriptionCallIndex += 1;
      const pending: PendingRoute = { route, fulfilled: false };
      transcriptionResponses[transcriptionCallIndex - 1] = pending;

      // This test expects exactly two transcription attempts (attempt #1 -> close, attempt #2 -> resolve).
      // If something unexpectedly triggers a third call, fulfill it immediately to avoid hanging the UI.
      if (transcriptionCallIndex > 2) {
        const payload = {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: JSON.stringify({ rawTranscript: '', cleanedTranscript: '' }) }],
              },
            },
          ],
        };
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
          });
        } catch {
          // Ignore fulfillment errors
        }
        return;
      }

      if (transcriptionCallIndex === 1) resolveCall1();
      if (transcriptionCallIndex === 2) resolveCall2();

      // Delay fulfillment. The test will resolve these routes later.
    });

    // Open ScenarioSetup: Practice mode sheet -> Role Play -> ScenarioSetup modal
    await page.getByRole('button', { name: /Start Practice/i }).click();
    await page.getByRole('button', { name: /Role Play/i }).click();
    const modalHeading = page.getByRole('heading', { name: 'Practice Role Play' });
    await expect(modalHeading).toBeVisible();

    // Start first transcription attempt.
    await page.getByRole('button', { name: /Or describe by voice/i }).click();
    await expect(page.getByRole('button', { name: /Stop Recording/i })).toBeVisible();
    await page.getByRole('button', { name: /Stop Recording/i }).click();
    await expect(page.getByText('Transcribing...')).toBeVisible();
    await call1Arrived;
    await screenshot('scenario-1-transcribing');

    // Close while in-flight: this must abort/invalidate the first attempt
    // so it can't overwrite UI state after a close+reopen race.
    await page.getByLabel('Close').click();
    await expect(modalHeading).not.toBeVisible();
    await screenshot('scenario-after-close');

    // Open again and start second transcription attempt.
    await page.getByRole('button', { name: /Start Practice/i }).click();
    await page.getByRole('button', { name: /Role Play/i }).click();
    await expect(modalHeading).toBeVisible();

    await page.getByRole('button', { name: /Or describe by voice/i }).click();
    await expect(page.getByRole('button', { name: /Stop Recording/i })).toBeVisible();
    await page.getByRole('button', { name: /Stop Recording/i }).click();
    await expect(page.getByText('Transcribing...')).toBeVisible();
    await call2Arrived;
    await screenshot('scenario-2-transcribing');

    const fulfillTranscription = async (pending: PendingRoute | undefined, raw: string, cleaned: string) => {
      if (!pending || pending.fulfilled) return;
      pending.fulfilled = true;
      const payload = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: JSON.stringify({ rawTranscript: raw, cleanedTranscript: cleaned }) }],
            },
          },
        ],
      };

      // Route fulfillment may throw if the request was fully aborted, but the app should still
      // remain responsive; we treat that as acceptable for this regression test.
      try {
        await pending.route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        });
      } catch {
        // Intentionally ignored.
      }
    };

    // Resolve the stale first attempt after the second spinner is showing.
    await fulfillTranscription(transcriptionResponses[0], 'RAW_ONE', 'CLEAN_ONE');

    // UI must remain on the second in-flight attempt and must NOT show transcript options
    // from the stale response.
    await expect(page.getByText('Transcribing...')).toBeVisible();
    await expect(page.locator('text=/Choose your transcript version/i')).toHaveCount(0);
    await expect(page.locator('text=RAW_ONE')).toHaveCount(0);
    await expect(page.locator('text=CLEAN_ONE')).toHaveCount(0);

    // Resolve the second attempt and verify only attempt #2 transcripts are shown.
    await fulfillTranscription(transcriptionResponses[1], 'RAW_TWO', 'CLEAN_TWO');

    await expect(page.locator('text=RAW_TWO')).toBeVisible();
    await expect(page.locator('text=CLEAN_TWO')).toBeVisible();
    await expect(page.locator('text=RAW_ONE')).toHaveCount(0);
    await expect(page.locator('text=CLEAN_ONE')).toHaveCount(0);
    await screenshot('scenario-final-transcripts');
  });
});

