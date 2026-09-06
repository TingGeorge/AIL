import { expect, type Page, test } from '@playwright/test';

const themeStorageKey = 'all-in-life-theme';

async function enterOnboarding(page: Page) {
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  await expect(tutorial).toBeVisible();
  await tutorial.getByRole('button', { name: '略過教學' }).click();
}

test('首次造訪固定使用暗色，進入引導頁也不會跳成系統亮色', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, themeStorageKey);

  await page.goto('/');

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), themeStorageKey),
    )
    .toBeNull();

  await enterOnboarding(page);
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('button', { name: '切換至亮色模式' }),
  ).toBeVisible();
});

test('尊重已儲存的亮色，且只在手動切換後更新偏好', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const seedKey = `${storageKey}:test-seeded`;
    if (window.sessionStorage.getItem(seedKey) !== 'true') {
      window.localStorage.setItem(storageKey, 'light');
      window.sessionStorage.setItem(seedKey, 'true');
    }
  }, themeStorageKey);

  await page.goto('/');

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');

  await enterOnboarding(page);
  await expect(root).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: '切換至暗色模式' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), themeStorageKey),
    )
    .toBe('dark');

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});
