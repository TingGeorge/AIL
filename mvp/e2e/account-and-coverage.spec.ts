import { expect, type Page, test } from '@playwright/test';

async function skipIntoHome(page: Page, url = '/') {
  await page.goto(url);
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }
  const skip = page.getByRole('button', { name: '略過', exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(
    page.getByRole('heading', { name: /今天要解決什麼/ }),
  ).toBeVisible();
}

async function reachDemoResults(page: Page) {
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();
  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible({ timeout: 7_000 });
}

test('公開首頁顯示來源、串接與驗證統計，訪客清單會要求登入', async ({
  page,
}) => {
  await skipIntoHome(page);

  const coverage = page.getByRole('region', { name: '資料來源與查核' });
  await expect(coverage).toContainText(
    /\d[\d,]* 筆已串接 · \d[\d,]* 筆核心已驗證/,
  );
  await coverage.getByRole('button', { name: /查看各類別/ }).click();
  for (const category of ['食品', '日用品', '免費／公益資源', '活動', '交通']) {
    await expect(coverage.getByText(category, { exact: true })).toBeVisible();
  }
  await expect(coverage).toContainText(/最近同步/);
  await expect(coverage.getByText('已串接', { exact: true })).toHaveCount(5);
  await expect(coverage.getByText('核心已驗證', { exact: true })).toHaveCount(
    5,
  );
  await expect(coverage.getByText('待確認', { exact: true })).toHaveCount(5);

  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '清單', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '登入生活帳號' }),
  ).toBeVisible();
  await expect(
    page.getByText('不登入也能搜尋；登入後才能儲存清單與收藏。'),
  ).toBeVisible();
});

test('手機探索卡片完整顯示分類視覺，且只替已驗證項目顯示勾勾', async ({
  page,
}) => {
  await skipIntoHome(page, '/?mode=demo');
  await reachDemoResults(page);

  const verifiedCard = page
    .locator('.result-card.provenance-verified-demo')
    .first();
  await expect(verifiedCard).toBeVisible();
  await expect(verifiedCard.locator('.result-verification-mark')).toHaveAttribute(
    'aria-label',
    /已驗證/,
  );
  await expect(
    page
      .locator('.result-card.provenance-simulated')
      .first()
      .locator('.result-verification-mark'),
  ).toHaveCount(0);

  const layout = await verifiedCard.locator('.result-open').evaluate((open) => {
    const art = open.querySelector<HTMLElement>('.result-art');
    const openRect = open.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    return {
      openHeight: openRect.height,
      artHeight: artRect?.height ?? 0,
      artPosition: art ? getComputedStyle(art).position : '',
    };
  });
  expect(layout.artPosition).toBe('absolute');
  expect(Math.abs(layout.openHeight - layout.artHeight)).toBeLessThanOrEqual(1);

  await verifiedCard.locator('.result-open').click();
  await expect(page.locator('.detail-verification-mark')).toHaveAttribute(
    'aria-label',
    /已驗證/,
  );
});

test('立即開始探索會帶入完整展示數據與候選', async ({ page }) => {
  await skipIntoHome(page);

  const wallet = page.getByRole('button', { name: '查看本月消費分析' });
  await expect(wallet).toContainText('NT$ 9,792');
  await expect(wallet).toContainText('3 筆紀錄');
  await wallet.click();
  await expect(page.locator('.category-chart')).toContainText('NT$208');
  await expect(page.locator('.category-chart')).toContainText('日用品');
  await expect(page.locator('.category-chart')).toContainText('NT$126');

  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '首頁' })
    .click();
  await reachDemoResults(page);
  await expect(page.locator('.result-card')).not.toHaveCount(0);
});

test('登入後收藏會寫入帳號並在重新整理後還原', async ({ page }) => {
  test.setTimeout(60_000);
  const username = `e2e_${Date.now().toString(36)}`;
  const password = 'AllInLife!2026';

  await page.goto('/');
  await page.getByRole('button', { name: '登入後儲存清單' }).click();
  await page.getByRole('tab', { name: '註冊' }).click();
  await page.getByPlaceholder('顯示名稱（選填）').fill('儲存測試');
  await page.getByPlaceholder('3–30 個英數字、_ 或 -').fill(username);
  await page.getByPlaceholder('至少 12 個字元').fill(password);
  await page.getByRole('button', { name: '建立帳號並登入' }).click();
  await expect(page.getByText('嗨，儲存測試')).toBeVisible();

  const restored = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/me') && response.ok(),
  );
  await page.goto('/?mode=demo');
  await restored;
  await page.getByRole('button', { name: '立即開始探索' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }
  const skip = page.getByRole('button', { name: '略過', exact: true });
  if (await skip.isVisible()) await skip.click();
  await reachDemoResults(page);

  const firstCard = page.locator('.result-card').first();
  const savedTitle = (
    await firstCard.locator('.result-title').innerText()
  ).trim();
  await firstCard.getByRole('button', { name: '加入清單' }).click();
  await expect(
    firstCard.getByRole('button', { name: '取消收藏' }),
  ).toBeVisible();
  await page.waitForTimeout(900);

  const reloaded = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/me') && response.ok(),
  );
  await page.reload();
  await reloaded;
  await page.getByRole('button', { name: '登入後儲存清單' }).click();
  await expect(page.getByText(`@${username}`)).toBeVisible();
  await page.getByRole('button', { name: '繼續探索' }).click();
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: /清單/ })
    .click();
  await expect(page.getByText(savedTitle, { exact: true })).toBeVisible();
});
