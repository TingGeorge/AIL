import { expect, test } from '@playwright/test';

test('亮色模式詳情維持一致表面與清楚的驗證標記', async ({ page }) => {
  await page.goto('/?mode=demo');
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }
  const skip = page.getByRole('button', { name: '略過', exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();
  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible({ timeout: 7_000 });
  await page.getByRole('button', { name: /YouBike 圓山短程串點/ }).click();
  const root = page.locator('html');
  if ((await root.getAttribute('data-theme')) !== 'light') {
    await page.getByRole('button', { name: '切換至亮色模式' }).click();
  }
  await expect(root).toHaveAttribute('data-theme', 'light');

  const appearance = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.app-header');
    const hero = document.querySelector<HTMLElement>('.detail-hero');
    const symbol = document.querySelector<HTMLElement>('.detail-hero-symbol');
    const mark = document.querySelector<HTMLElement>(
      '.detail-hero .detail-verification-mark',
    );
    if (!header || !hero || !symbol || !mark) {
      throw new Error('Light detail elements are missing');
    }
    const heroRect = hero.getBoundingClientRect();
    const symbolRect = symbol.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    return {
      headerBackground: getComputedStyle(header).backgroundColor,
      heroBackground: getComputedStyle(hero).backgroundImage,
      symbolColor: getComputedStyle(symbol).color,
      markBackground: getComputedStyle(mark).backgroundColor,
      markInsideHero:
        markRect.top >= heroRect.top &&
        markRect.right <= heroRect.right &&
        markRect.bottom <= heroRect.bottom,
      markAttachedToSymbol:
        markRect.left < symbolRect.right && markRect.top < symbolRect.bottom,
    };
  });

  expect(appearance.headerBackground).not.toBe('rgb(17, 18, 15)');
  expect(appearance.heroBackground).toContain('gradient');
  expect(appearance.symbolColor).toBe('rgb(255, 255, 255)');
  expect(appearance.markBackground).toBe('rgb(217, 255, 67)');
  expect(appearance.markInsideHero).toBe(true);
  expect(appearance.markAttachedToSymbol).toBe(true);
});
