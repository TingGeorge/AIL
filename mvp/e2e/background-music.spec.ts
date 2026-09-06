import { expect, test } from '@playwright/test';

test('首次預設關閉，只在音樂按鈕單擊後播放', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('all-in-life:background-music-enabled');
    const events: string[] = [];
    Object.defineProperty(window, '__ailMusicEvents', { value: events });
    HTMLMediaElement.prototype.play = function play() {
      events.push(`play:${this.currentSrc || this.src}`);
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: false,
      });
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      events.push(`pause:${this.currentSrc || this.src}`);
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: true,
      });
      this.dispatchEvent(new Event('pause'));
    };
  });

  await page.goto('/');
  const welcomeMusicButton = page.getByRole('button', {
    name: '背景音樂',
  });
  await expect(welcomeMusicButton).toBeVisible();
  await expect(welcomeMusicButton).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & { __ailMusicEvents?: string[] }
          ).__ailMusicEvents?.filter((event) => event.startsWith('play:'))
            .length ?? 0,
      ),
    )
    .toBe(0);
  const [welcomeMusicBox, mascotBox] = await Promise.all([
    welcomeMusicButton.boundingBox(),
    page.locator('.welcome-aili').boundingBox(),
  ]);
  expect(welcomeMusicBox).not.toBeNull();
  expect(mascotBox).not.toBeNull();
  expect(mascotBox!.x + mascotBox!.width).toBeLessThan(welcomeMusicBox!.x);

  await welcomeMusicButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & { __ailMusicEvents?: string[] }
          ).__ailMusicEvents?.filter((event) => event.startsWith('play:'))
            .length ?? 0,
      ),
    )
    .toBe(1);
  await expect(welcomeMusicButton).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem('all-in-life:background-music-enabled'),
      ),
    )
    .toBe('true');

  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }
  const skip = page.getByRole('button', { name: '略過', exact: true });
  if (await skip.isVisible()) await skip.click();

  const musicButton = page.getByRole('button', { name: '背景音樂' });
  await expect(musicButton).toBeVisible();
  await expect(musicButton).toHaveAttribute('aria-pressed', 'true');
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

  await musicButton.click();
  await expect(musicButton).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem('all-in-life:background-music-enabled'),
      ),
    )
    .toBe('false');
});

test('播放失敗時維持關閉並可單擊重試', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('all-in-life:background-music-enabled');
    let attempts = 0;
    Object.defineProperty(window, '__ailMusicAttempts', {
      get: () => attempts,
    });
    HTMLMediaElement.prototype.play = function play() {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('blocked'));
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: false,
      });
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: true,
      });
      this.dispatchEvent(new Event('pause'));
    };
  });

  await page.goto('/');
  const musicButton = page.getByRole('button', { name: '背景音樂' });
  await musicButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __ailMusicAttempts?: number })
            .__ailMusicAttempts,
      ),
    )
    .toBe(1);
  await expect(musicButton).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem('all-in-life:background-music-enabled'),
      ),
    )
    .toBe('false');

  await musicButton.click();
  await expect(musicButton).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __ailMusicAttempts?: number })
            .__ailMusicAttempts,
      ),
    )
    .toBe(2);
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
