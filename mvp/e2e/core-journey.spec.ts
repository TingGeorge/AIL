import { expect, type Page, test } from '@playwright/test';

async function expectNoDemoLabels(page: Page) {
  await expect(page.locator('body')).not.toContainText(
    /demo|模擬|示範|展示候選|情境資料|正式版|正式帳戶|精選情境|情境建議|體驗完整|D1|資料快照|來源已確認|條件估算|已驗證欄位|先確認這件事|尚未串接|未來接上/i,
  );
}

async function enterDemo(page: Page) {
  await page.goto('/');
  await expectNoDemoLabels(page);
  await page.getByRole('button', { name: '立即開始探索' }).click();

  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }

  const onboardingSkip = page.getByRole('button', {
    name: '略過',
    exact: true,
  });
  if (await onboardingSkip.isVisible()) {
    await onboardingSkip.click();
  }

  await expect(
    page.getByRole('button', { name: '下一步：確認需求與限制' }),
  ).toBeVisible();
  await expectNoDemoLabels(page);

  await page.locator('.screen-enter').evaluate(async (screen) => {
    await Promise.all(
      screen.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });

  const [teamCardBox, locationCardBox] = await Promise.all([
    page.locator('.quick-team').boundingBox(),
    page.locator('.location-consent').boundingBox(),
  ]);
  expect(teamCardBox).not.toBeNull();
  expect(locationCardBox).not.toBeNull();
  expect(locationCardBox?.x).toBe(teamCardBox?.x);
  expect(locationCardBox?.width).toBe(teamCardBox?.width);

  const locationActionWidths = await page
    .locator('.location-consent-actions button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().width),
    );
  expect(locationActionWidths).toHaveLength(2);
  expect(new Set(locationActionWidths).size).toBe(1);
}

async function reachResults(page: Page) {
  await enterDemo(page);
  await page
    .getByRole('button', { name: '下一步：確認需求與限制' })
    .click();
  await page
    .getByRole('button', { name: '確認完成，前往開始探索' })
    .click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible({ timeout: 5_000 });
}

test('完整情境核心旅程、底部選單與收藏復原', async ({ page }) => {
  await enterDemo(page);

  await page
    .getByRole('button', { name: '下一步：確認需求與限制' })
    .click();
  await expect(
    page.getByRole('heading', { name: '把條件調到剛剛好' }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: '確認完成，前往開始探索' })
    .click();
  await page.getByRole('button', { name: '開始探索' }).click();

  await expect(
    page.getByRole('heading', { name: /CP 值獵人.*零元獵人出動/ }),
  ).toBeVisible();
  await expect(page.getByText(/^\d+%$/)).toHaveCount(0);

  const resultCountHeading = page.getByRole('heading', {
    name: /找到 \d+ 個合適選擇/,
  });
  await expect(resultCountHeading).toBeVisible({ timeout: 5_000 });
  const initialResultCount = Number(
    (await resultCountHeading.textContent())?.match(/\d+/)?.[0],
  );
  await expectNoDemoLabels(page);

  await page.getByRole('button', { name: /排序方式/ }).click();
  const sortSheet = page.getByRole('dialog', { name: '選擇排序方式' });
  await expect(sortSheet).toBeVisible();
  await sortSheet.getByRole('button', { name: /距離優先/ }).click();
  await expect(page.getByRole('button', { name: /排序方式 距離優先/ })).toBeVisible();

  await page.getByRole('button', { name: /快速篩選/ }).click();
  const filterSheet = page.getByRole('dialog', { name: '快速調整結果' });
  await expect(filterSheet).toBeVisible();
  await filterSheet.getByRole('button', { name: '1 km', exact: true }).click();
  await filterSheet.getByRole('button', { name: '套用快速篩選' }).click();
  await expect(resultCountHeading).toBeVisible();
  const filteredResultCount = Number(
    (await resultCountHeading.textContent())?.match(/\d+/)?.[0],
  );
  expect(filteredResultCount).toBeLessThan(initialResultCount);

  const firstSaveButton = page
    .getByRole('button', { name: '加入清單' })
    .first();
  await firstSaveButton.click();
  await expect(page.getByRole('button', { name: '復原' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '取消收藏' }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '復原' }).click();
  await expect(firstSaveButton).toBeVisible();
});

test('揪團卡片可開啟詳情並登記', async ({ page }) => {
  await enterDemo(page);

  await page.getByRole('button', { name: '揪團', exact: true }).click();
  await expectNoDemoLabels(page);
  await page
    .getByRole('button', { name: /夜間計程車順風團/ })
    .click();

  const teamSheet = page.getByRole('dialog', {
    name: '夜間計程車順風團',
  });
  await expect(teamSheet).toBeVisible();
  await expect(teamSheet.getByText('圓山站 2 號出口')).toBeVisible();
  await teamSheet.getByRole('button', { name: '登記這一團' }).click();

  await expect(page.getByText(/已登記「夜間計程車順風團」/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /夜間計程車順風團.*已登記/ }),
  ).toBeVisible();
});

test('需求太短時留在 STEP 1 並顯示即時錯誤', async ({ page }) => {
  await enterDemo(page);

  const need = page.getByRole('textbox', { name: '文字輸入需求' });
  await need.fill('吃');
  await page
    .getByRole('button', { name: '下一步：確認需求與限制' })
    .click();

  await expect(page.getByRole('alert')).toContainText('至少用 3 個字');
  await expect(
    page.getByRole('button', { name: '下一步：確認需求與限制' }),
  ).toBeVisible();
});

test('首頁與分析頁共用同一份預算摘要，圖表可切換與點選', async ({
  page,
}) => {
  await enterDemo(page);

  const wallet = page.getByRole('button', { name: '查看本月消費分析' });
  await expect(wallet).toContainText('NT$ 9,792');
  await expect(wallet).toContainText('NT$ 112');
  await expect(wallet).toContainText('已花 NT$208 ／ 月預算 NT$10,000');
  await wallet.click();

  await expect(page.getByRole('heading', { name: '消費分析' })).toBeVisible();
  await expect(page.locator('.analytics-hero')).toContainText('NT$ 9,792');
  await page.getByRole('button', { name: '省下', exact: true }).click();
  await page
    .getByRole('button', { name: /交通 省下 NT\$68/ })
    .click();
  await expect(page.locator('.category-insight')).toContainText('交通');
  await expect(page.locator('.category-insight')).toContainText('61%');

  await page.getByRole('button', { name: '調整月預算' }).click();
  const monthlyBudget = page.getByRole('spinbutton', { name: '月預算金額' });
  await monthlyBudget.fill('12345');
  await expect(monthlyBudget).toHaveValue('12345');
  await expect(page.locator('.analytics-hero')).toContainText('NT$ 12,137');
  await expectNoDemoLabels(page);
});

test('預算為 0 時仍可直接清空並輸入新金額', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('button', { name: /零元.*零元探索/ }).click();
  await page
    .getByRole('button', { name: '下一步：確認需求與限制' })
    .click();

  const budget = page.getByRole('spinbutton', { name: '預算', exact: true });
  await expect(budget).toHaveValue('0');
  await budget.fill('');
  await expect(budget).toHaveValue('');
  await budget.fill('750');
  await expect(budget).toHaveValue('750');
});

test('自己的資料流程也直接帶入完整預設內容', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '使用自己的資料' }).click();
  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }
  const onboardingSkip = page.getByRole('button', { name: '略過', exact: true });
  if (await onboardingSkip.isVisible()) await onboardingSkip.click();

  await expect(page.getByRole('button', { name: '查看本月消費分析' })).toContainText(
    'NT$ 9,792',
  );
  await expect(page.locator('.quick-team')).toContainText('五人晚餐團還差 2 位');
  await expectNoDemoLabels(page);
});

test('回報送出後立即更新統計並保留明細', async ({ page }) => {
  await enterDemo(page);
  await page
    .getByRole('button', { name: '下一步：確認需求與限制' })
    .click();
  await page
    .getByRole('button', { name: '確認完成，前往開始探索' })
    .click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /雙人古早味肉圓組合/ }).click();

  await expect(page.locator('.facts-grid')).toContainText('2 則');
  await expectNoDemoLabels(page);
  await page.getByRole('button', { name: '回報資訊' }).click();
  await expect(page.locator('.report-summary')).toContainText('2 則');
  await page.getByRole('button', { name: '價格不同' }).click();
  await page.getByRole('textbox', { name: '補充說明' }).fill('今天看到的新價格是 NT$190');
  await page.getByRole('button', { name: '送出回報' }).click();

  await expect(page.getByText('回報已記錄')).toBeVisible();
  await expect(page.locator('.report-summary')).toContainText('3 則');
  await expect(page.locator('.recent-reports')).toContainText('今天看到的新價格是 NT$190');
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.locator('.facts-grid')).toContainText('3 則');
});

test('CP 權重固定合計 100 並會真正更換第一名', async ({ page }) => {
  await enterDemo(page);
  await page
    .getByRole('button', { name: '下一步：確認需求與限制' })
    .click();
  await page
    .getByRole('button', { name: '確認完成，前往開始探索' })
    .click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible({ timeout: 5_000 });

  await page.locator('.cp-formula > summary').click();
  await expect(page.locator('.result-title').first()).toHaveText(
    '臺北花博農民市集',
  );
  await page.getByRole('button', { name: '最合喜好' }).click();
  await expect(page.locator('.result-title').first()).toHaveText(
    '雙人義大利麵提案',
  );
  await expect(page.getByRole('button', { name: /排序方式 CP 值優先/ })).toBeVisible();

  const weights = await page.getByRole('slider').evaluateAll((sliders) =>
    sliders.map((slider) => Number(slider.getAttribute('aria-valuenow'))),
  );
  expect(weights.reduce((sum, value) => sum + value, 0)).toBe(100);
  await expect(page.locator('.cp-ranking-live')).toContainText(
    '目前第 1 名：雙人義大利麵提案',
  );
});

test('結果條件、工具列與分類按鈕維持可讀尺寸，示意圖不再放大成實景', async ({
  page,
}) => {
  await reachResults(page);

  await expect(page.locator('.results-context')).toContainText('2 人');
  await expect(page.locator('.results-context')).toContainText('NT$500');
  await expect(page.locator('.results-comparison')).toHaveCount(0);

  const controlMetrics = await page.evaluate(() => ({
    contextFont: Number.parseFloat(
      getComputedStyle(document.querySelector('.results-context > span')!).fontSize,
    ),
    toolbarHeights: [...document.querySelectorAll<HTMLElement>(
      '.filter-row > button, .filter-row .sort-button',
    )].map((element) => element.getBoundingClientRect().height),
    categoryHeight: document
      .querySelector<HTMLElement>('.category-filter button')!
      .getBoundingClientRect().height,
  }));
  expect(controlMetrics.contextFont).toBeGreaterThanOrEqual(10);
  expect(controlMetrics.toolbarHeights.every((height) => height >= 44)).toBe(true);
  expect(controlMetrics.categoryHeight).toBeGreaterThanOrEqual(39);

  await page
    .getByRole('button', { name: /臺北孔子廟夜間散步/ })
    .click();
  await expect(page.locator('.detail-hero')).toBeVisible();
  await expect(page.locator('.detail-hero')).toContainText('為你精選');
  await expect(page.locator('.detail-image')).toHaveCount(0);
});

test('清單批次結算會建立交易、更新分析，且可刪除交易與清單項目', async ({
  page,
}) => {
  await reachResults(page);

  const pastaResult = page
    .locator('.result-card')
    .filter({ hasText: '雙人義大利麵提案' });
  const museumResult = page
    .locator('.result-card')
    .filter({ hasText: '北美館傍晚看展' });
  await pastaResult.getByRole('button', { name: '加入清單' }).click();
  await museumResult.getByRole('button', { name: '加入清單' }).click();
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: /清單/ })
    .click();

  await expect(page.getByRole('heading', { name: '這次清單' })).toBeVisible();
  const checklistItem = page
    .locator('.checklist article')
    .filter({ hasText: '雙人義大利麵提案' });
  const museumItem = page
    .locator('.checklist article')
    .filter({ hasText: '北美館傍晚看展' });
  await expect(checklistItem).toContainText('待結算');
  await expect(museumItem).toContainText('待結算');
  await expect(page.locator('.checkout-button')).toHaveCount(0);
  const batchCheckout = page.locator('.batch-checkout-bar');
  await expect(batchCheckout).toContainText('已選 2 / 2 筆');
  await expect(batchCheckout).toContainText('NT$380');

  await batchCheckout
    .getByRole('button', { name: '批次結算 2 筆' })
    .click();
  await expect(checklistItem).toContainText('已結算');
  await expect(museumItem).toContainText('已結算');
  const recentTransactions = page.locator('.recent-transactions');
  await expect(recentTransactions).toContainText('雙人義大利麵提案');
  await expect(recentTransactions).toContainText('北美館傍晚看展');
  await expect(recentTransactions).toContainText('NT$380');

  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '首頁' })
    .click();
  const wallet = page.getByRole('button', { name: '查看本月消費分析' });
  await expect(wallet).toContainText('NT$ 9,412');
  await expect(wallet).toContainText('已花 NT$588');

  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: /清單/ })
    .click();
  await page
    .locator('.recent-transactions')
    .getByRole('button', { name: '刪除交易 雙人義大利麵提案' })
    .click();
  await expect(checklistItem).toContainText('待結算');
  await expect(museumItem).toContainText('已結算');
  await expect(recentTransactions).not.toContainText('雙人義大利麵提案');

  await museumItem
    .getByRole('button', { name: '選取 北美館傍晚看展' })
    .click();
  await batchCheckout
    .getByRole('button', { name: '取消 1 筆結算' })
    .click();
  await expect(museumItem).toContainText('待結算');
  await expect(recentTransactions).not.toContainText('北美館傍晚看展');

  await checklistItem
    .getByRole('button', { name: '選取 雙人義大利麵提案' })
    .click();
  await expect(batchCheckout).toContainText('已選 1 / 2 筆');
  await checklistItem
    .getByRole('button', { name: '刪除清單項目 雙人義大利麵提案' })
    .click();
  await expect(checklistItem).toHaveCount(0);
  await expect(batchCheckout).toContainText('已選 0 / 1 筆');
});

test('通知角標位於按鈕內，全部已讀後同步清除清單狀態', async ({ page }) => {
  await enterDemo(page);

  const notificationButton = page.getByRole('button', {
    name: '通知，3 則未讀',
  });
  await expect(notificationButton).toBeVisible();
  await expect(page.locator('.header-count')).toHaveCount(0);
  const badgeInsideButton = await notificationButton.evaluate((button) => {
    const badge = button.querySelector<HTMLElement>('.notification-badge');
    if (!badge) return false;
    const buttonBox = button.getBoundingClientRect();
    const badgeBox = badge.getBoundingClientRect();
    return (
      badgeBox.left >= buttonBox.left &&
      badgeBox.top >= buttonBox.top &&
      badgeBox.right <= buttonBox.right &&
      badgeBox.bottom <= buttonBox.bottom
    );
  });
  expect(badgeInsideButton).toBe(true);

  await notificationButton.click();
  await page.getByRole('button', { name: '全部已讀' }).click();
  await expect(page.locator('.notification-list > button.unread')).toHaveCount(0);
});
