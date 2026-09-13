import { expect, test } from '@playwright/test';

test('create URL end to end: form → success → details', async ({ page }) => {
  await page.goto('/create');
  await page.getByLabel(/original url/i).fill(`https://example.com/e2e-${String(Date.now())}`);
  await page.getByRole('button', { name: /create short url/i }).click();

  await expect(page.getByText('URL created successfully')).toBeVisible();
  await page.getByRole('link', { name: /view details/i }).click();
  await expect(page.getByText('Total clicks')).toBeVisible();
});

test('dashboard shows a freshly created link in recents', async ({ page }) => {
  const target = `https://example.com/e2e-dash-${String(Date.now())}`;
  await page.goto('/create');
  await page.getByLabel(/original url/i).fill(target);
  await page.getByRole('button', { name: /create short url/i }).click();
  await expect(page.getByText('URL created successfully')).toBeVisible();

  await page.goto('/');
  await expect(page.getByText(target)).toBeVisible();
});
