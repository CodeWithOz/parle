import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Parle.*French/i);
  await expect(page.locator('#root')).toBeVisible();
});
