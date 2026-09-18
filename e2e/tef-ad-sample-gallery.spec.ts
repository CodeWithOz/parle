import { test, expect } from '@playwright/test';

/**
 * TEF ad sample gallery flow.
 * Real PNGs from public/tef-samples/ are served by the dev server (not mocked),
 * which is the coverage unit tests cannot provide.
 */

type ConfirmRequest = { imageBase64: string; mimeType: string; mode: string };

// Base64 of a 1x1 PNG is ~90 chars; real sample ads must be far larger.
const MINIMAL_PNG_BASE64_LENGTH = 100;
const PNG_MAGIC_BASE64 = 'iVBORw0KGgo';

const CASES = [
  {
    nav: /TEF Questions/i,
    heading: 'Practice Ad Questioning',
    mode: 'questioning',
    sample: 'Home care job',
  },
  {
    nav: /TEF Persuasion/i,
    heading: 'Practice Ad Persuasion',
    mode: 'persuasion',
    sample: 'Dométudes tutoring',
  },
] as const;

test.describe('TEF Ad Sample Gallery Flow', () => {
  let confirmRequests: ConfirmRequest[];

  test.beforeEach(async ({ page }) => {
    confirmRequests = [];

    // Mock session status so the app believes an API key is available
    // (this spec does not go through POST /api/session like scenario-description-abort.spec.ts).
    await page.route('**/api/session/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hasGemini: true, hasOpenai: false, hasApiKey: true }),
      });
    });

    await page.route('**/api/tef-ad-confirm', async (route) => {
      confirmRequests.push(route.request().postDataJSON() as ConfirmRequest);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: 'Test advertisement for sample ad validation',
          roleSummary:
            'You are a customer service representative for this product. Answer questions professionally.',
        }),
      });
    });

    await page.goto('/');
  });

  for (const { nav, heading, mode, sample } of CASES) {
    test(`${mode}: clicking a sample thumbnail sends the real PNG and shows the confirmation step`, async ({
      page,
    }) => {
      await page.getByRole('button', { name: nav }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByText(/or try an official sample ad/i)).toBeVisible();

      await expect(page.getByRole('button', { name: /^Use sample ad:/ })).toHaveCount(4);

      await page.getByRole('button', { name: `Use sample ad: ${sample}` }).click();

      await expect(page.getByText(/or try an official sample ad/i)).not.toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText(/Test advertisement for sample ad validation/i)).toBeVisible();
      await expect(page.getByText(/You are a customer service representative/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Start Conversation/i })).toBeVisible();

      expect(confirmRequests).toHaveLength(1);
      const body = confirmRequests[0];
      expect(body.mimeType).toBe('image/png');
      expect(body.mode).toBe(mode);
      expect(body.imageBase64.startsWith(PNG_MAGIC_BASE64)).toBe(true);
      expect(body.imageBase64.length).toBeGreaterThan(MINIMAL_PNG_BASE64_LENGTH);
      // The sample URL must never be forwarded to Gemini (AGENTS.md)
      expect(JSON.stringify(body)).not.toContain('tef-samples');
    });
  }

  test('a failed sample fetch shows an error and a different sample still works afterwards', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /TEF Questions/i }).click();
    await expect(page.getByRole('heading', { name: 'Practice Ad Questioning' })).toBeVisible();

    await page.route('**/tef-samples/*.png', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });

    await page.getByRole('button', { name: 'Use sample ad: Home care job' }).click();

    await expect(page.getByText(/Failed to load the sample ad/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/or try an official sample ad/i)).toBeVisible();
    expect(confirmRequests).toHaveLength(0);

    // Restore real files; the in-flight lock must have been released by the error.
    await page.unroute('**/tef-samples/*.png');

    const others = page.getByRole('button', { name: /^Use sample ad:/ });
    await others.nth(1).click();

    await expect(page.getByRole('button', { name: /Start Conversation/i })).toBeVisible({
      timeout: 10000,
    });
    expect(confirmRequests).toHaveLength(1);
  });
});
