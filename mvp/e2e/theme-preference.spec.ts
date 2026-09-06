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

test('品牌歡迎頁固定暗色，離開後恢復已儲存的亮色偏好', async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const seedKey = `${storageKey}:test-seeded`;
    if (window.sessionStorage.getItem(seedKey) !== 'true') {
      window.localStorage.setItem(storageKey, 'light');
      window.sessionStorage.setItem(seedKey, 'true');
    }
  }, themeStorageKey);

  await page.goto('/');

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), themeStorageKey),
    )
    .toBe('light');

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

test('教學進度條清楚區分完成、目前與未完成步驟', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '立即開始探索' }).click();

  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  const progressButtons = tutorial.locator('.sop-guide-progress button');
  await expect(progressButtons).toHaveCount(4);
  await tutorial.getByRole('button', { name: '前往教學第 2 步' }).click();

  await expect(progressButtons.nth(0)).toHaveClass(/done/);
  await expect(progressButtons.nth(1)).toHaveClass(/active/);
  await expect(progressButtons.nth(1)).toHaveAttribute('aria-current', 'step');
  const states = await progressButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const fill = button.querySelector<HTMLElement>('i');
      return {
        width: fill?.getBoundingClientRect().width ?? 0,
        background: fill ? getComputedStyle(fill).backgroundImage : '',
        animation: fill ? getComputedStyle(fill).animationName : '',
      };
    }),
  );
  expect(states[0].width).toBeGreaterThan(10);
  expect(states[1].width).toBeGreaterThan(10);
  expect(states[1].background).toContain('linear-gradient');
  expect(states[1].animation).toBe('none');
  expect(states[2].width).toBeLessThan(1);
});
