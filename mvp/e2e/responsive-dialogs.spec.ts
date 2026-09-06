import { expect, type Locator, type Page, test } from '@playwright/test';

type Viewport = { name: string; width: number; height: number };

async function expectInsideViewport(locator: Locator, viewport: Viewport) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  return box!;
}

async function reachResults(page: Page) {
  await page.goto('/?mode=demo');
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  await expect(tutorial).toBeVisible();
  await tutorial.getByRole('button', { name: '略過教學' }).click();
  const onboardingSkip = page.getByRole('button', {
    name: '略過',
    exact: true,
  });
  if (await onboardingSkip.isVisible()) await onboardingSkip.click();
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();
  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible();
}

for (const viewport of [
  { name: '手機', width: 390, height: 844 },
  { name: '短視窗', width: 514, height: 530 },
  { name: '桌面', width: 1280, height: 900 },
] satisfies Viewport[]) {
  test(`${viewport.name}的篩選與 QR 對話框維持在可視範圍`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await reachResults(page);

    await page.getByRole('button', { name: /快速篩選/ }).click();
    const filterDialog = page.getByRole('dialog', { name: '快速調整結果' });
    await expect(filterDialog).toBeVisible();
    const filterBox = await expectInsideViewport(filterDialog, viewport);
    if (viewport.width >= 600) {
      expect(
        Math.abs(filterBox.y + filterBox.height / 2 - viewport.height / 2),
      ).toBeLessThanOrEqual(2);
    }
    await page.keyboard.press('Escape');

    await page.locator('.result-card > .result-open').first().click();
    await page.getByRole('button', { name: '分享', exact: true }).click();
    const shareDialog = page.getByRole('dialog', {
      name: 'ALL IN LIFE 分享連結',
    });
    await expect(shareDialog).toBeVisible();
    const shareBox = await expectInsideViewport(shareDialog, viewport);
    expect(
      Math.abs(shareBox.y + shareBox.height / 2 - viewport.height / 2),
    ).toBeLessThanOrEqual(2);

    const qr = shareDialog.locator('.qr-frame');
    await qr.scrollIntoViewIfNeeded();
    const qrBox = await expectInsideViewport(qr, viewport);
    expect(qrBox.x).toBeGreaterThanOrEqual(shareBox.x);
    expect(qrBox.y).toBeGreaterThanOrEqual(shareBox.y);
    expect(qrBox.x + qrBox.width).toBeLessThanOrEqual(
      shareBox.x + shareBox.width + 1,
    );
    expect(qrBox.y + qrBox.height).toBeLessThanOrEqual(
      shareBox.y + shareBox.height + 1,
    );
  });
}
