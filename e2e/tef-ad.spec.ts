import { test, expect } from '@playwright/test';

test.describe('TEF Ad Persuasion Practice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('landing page shows Practice Ad Persuasion entry point', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Practice Ad Persuasion/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Practice Role Play/i })).toBeVisible();
  });

  test('opening Ad Persuasion shows setup modal with upload step', async ({ page }) => {
    await page.getByRole('button', { name: /Practice Ad Persuasion/i }).click();
    const modalHeading = page.getByRole('heading', { name: 'Practice Ad Persuasion' });
    await expect(modalHeading).toBeVisible();
    await expect(page.getByText(/Upload a French advertisement image/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Image/i })).toBeVisible();
    await expect(page.getByLabel('Upload advertisement image')).toBeVisible();
  });

  test('closing setup modal returns to landing', async ({ page }) => {
    await page.getByRole('button', { name: /Practice Ad Persuasion/i }).click();
    await expect(page.getByRole('heading', { name: 'Practice Ad Persuasion' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Practice Ad Persuasion' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Practice Ad Persuasion/i })).toBeVisible();
  });

  test('setup modal has accessible close control', async ({ page }) => {
    await page.getByRole('button', { name: /Practice Ad Persuasion/i }).click();
    const closeButton = page.getByRole('button', { name: 'Close' });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeEnabled();
  });
});
