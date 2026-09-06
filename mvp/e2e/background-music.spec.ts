import { expect, type Page, test } from '@playwright/test';

async function enterHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }
  const skip = page.getByRole('button', { name: '略過', exact: true });
  if (await skip.isVisible()) await skip.click();
}

test('單一背景音樂持續播放並可關閉', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('all-in-life:background-music-enabled');
    const events: string[] = [];
    Object.defineProperty(window, '__ailMusicEvents', { value: events });
    HTMLMediaElement.prototype.play = function play() {
      events.push(`play:${this.currentSrc || this.src}`);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      events.push(`pause:${this.currentSrc || this.src}`);
    };
  });

  await page.goto('/');
  const welcomeMusicButton = page.getByRole('button', {
    name: '關閉背景音樂',
  });
  await expect(welcomeMusicButton).toBeVisible();
  const [welcomeMusicBox, mascotBox] = await Promise.all([
    welcomeMusicButton.boundingBox(),
    page.locator('.welcome-aili').boundingBox(),
  ]);
  expect(welcomeMusicBox).not.toBeNull();
  expect(mascotBox).not.toBeNull();
  expect(mascotBox!.x + mascotBox!.width).toBeLessThan(welcomeMusicBox!.x);
  await enterHome(page);
  await expect(
    page.getByRole('button', { name: '關閉背景音樂' }),
  ).toBeVisible();
  const musicButton = page.getByRole('button', { name: '關閉背景音樂' });
  const menuButton = page.getByRole('button', { name: '開啟設定' });
  const [musicBox, menuBox] = await Promise.all([
    musicButton.boundingBox(),
    menuButton.boundingBox(),
  ]);
  expect(musicBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(musicBox!.x).toBeLessThan(menuBox!.x);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __ailMusicEvents?: string[] }
        ).__ailMusicEvents?.some(
          (event) =>
            event.startsWith('play:') &&
            event.endsWith('/audio/all-in-life-light-theme.wav'),
        ),
      ),
    )
    .toBe(true);

  await page.getByRole('button', { name: '關閉背景音樂' }).click();
  await expect(
    page.getByRole('button', { name: '開啟背景音樂' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem('all-in-life:background-music-enabled'),
      ),
    )
    .toBe('false');
});

test('引導頁的略過按鈕固定在最右側', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }

  const musicButton = page.getByRole('button', { name: /背景音樂/ });
  const skipButton = page.getByRole('button', { name: '略過', exact: true });
  const [musicBox, skipBox] = await Promise.all([
    musicButton.boundingBox(),
    skipButton.boundingBox(),
  ]);
  expect(musicBox).not.toBeNull();
  expect(skipBox).not.toBeNull();
  expect(musicBox!.x).toBeLessThan(skipBox!.x);
});
