import { expect, type Page, test } from '@playwright/test';

const unknownFoodTitle = '巷口暖心雙人餐';
const prohibitedPriceCopy = /依現場價格|依現場方案|價格依現場方案|待補金額/u;

const catalogPayload = {
  source: 'snapshot',
  fallback: true,
  syncedAt: '2026-09-06T00:00:00.000Z',
  eventWindow: {
    startsAt: '2026-09-06T00:00:00.000Z',
    endsAt: '2026-10-06T00:00:00.000Z',
    days: 30,
  },
  coverage: {
    center: { latitude: 25.07133, longitude: 121.52024 },
    radiusM: 2_000,
  },
  items: [
    {
      id: 'PLACE:known_food_price',
      subjectType: 'PLACE',
      categoryKey: 'FOOD',
      categoryLabel: '食品',
      kind: 'RESTAURANT',
      title: '市場現做便當',
      provider: '臺北市官方資料',
      address: '臺北市大同區承德路三段 1 號',
      latitude: 25.0709,
      longitude: 121.5198,
      distanceM: 180,
      cost: {
        state: 'KNOWN',
        amountTwd: 135,
        reason: '官方資料提供目前價格。',
      },
      availability: {
        state: 'CURRENT',
        startsAt: null,
        endsAt: null,
        text: '今日 11:00–19:30',
      },
      verification: {
        status: 'VERIFIED',
        label: '地點與價格已驗證',
        fields: ['identity', 'location', 'cost'],
      },
      condition: '每日數量有限，售完為止。',
      source: {
        title: '臺北市餐飲資料',
        publisher: '臺北市政府',
        url: 'https://example.test/known-food',
        verifiedAt: '2026-09-05T00:00:00.000Z',
      },
      evidenceQuote: '官方資料列出單份便當價格。',
      actionUrl: null,
      tags: ['便當', '午餐'],
      realtime: null,
    },
    {
      id: 'PLACE:unknown_food_price',
      subjectType: 'PLACE',
      categoryKey: 'FOOD',
      categoryLabel: '食品',
      kind: 'RESTAURANT',
      title: unknownFoodTitle,
      provider: '臺北市官方資料',
      address: '臺北市大同區大龍街 2 號',
      latitude: 25.072,
      longitude: 121.521,
      distanceM: 320,
      cost: {
        state: 'UNKNOWN',
        amountTwd: null,
        reason: '官方來源未提供可驗證價格。',
      },
      availability: {
        state: 'UNKNOWN',
        startsAt: null,
        endsAt: null,
        text: '營業時間待確認',
      },
      verification: {
        status: 'PARTIAL',
        label: '地點已驗證',
        fields: ['identity', 'location'],
      },
      condition: '來源價格與營業時間待確認。',
      source: {
        title: '臺北市餐飲資料',
        publisher: '臺北市政府',
        url: 'https://example.test/unknown-food',
        verifiedAt: '2026-09-05T00:00:00.000Z',
      },
      evidenceQuote: '官方資料只列出店名與地址，沒有提供菜單價格。',
      actionUrl: null,
      tags: ['雙人餐', '晚餐'],
      realtime: null,
    },
  ],
  facets: [
    {
      key: 'FOOD',
      label: '食品',
      count: 2,
      verifiedCount: 1,
      sources: [
        {
          title: '臺北市餐飲資料',
          publisher: '臺北市政府',
          url: 'https://example.test/catalog',
        },
      ],
    },
  ],
  warnings: ['測試使用固定的官方資料快照。'],
};

function firstTwdAmount(text: string) {
  const match = text.match(/NT\$\s*([\d,]+)/u);
  const amount = match ? Number(match[1].replaceAll(',', '')) : Number.NaN;
  expect(Number.isFinite(amount), `找不到可比較的 NT$ 金額：${text}`).toBe(
    true,
  );
  return amount;
}

async function enterFormalHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '立即開始探索' }).click();

  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }

  const onboardingSkip = page.getByRole('button', {
    name: '略過',
    exact: true,
  });
  if (await onboardingSkip.isVisible()) await onboardingSkip.click();

  await expect(
    page.getByRole('heading', { name: /今天要解決什麼/ }),
  ).toBeVisible();
}

async function reachDemoResults(page: Page) {
  await page.goto('/?mode=demo');
  await page.getByRole('button', { name: '立即開始探索' }).click();

  const tutorial = page.getByRole('dialog', { name: '使用教學' });
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: '略過教學' }).click();
  }

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
  ).toBeVisible({
    timeout: 30_000,
  });
}

test('Demo 結果都有可演練的數字價格，估算與已驗證免費清楚分流', async ({
  page,
}) => {
  await reachDemoResults(page);

  const cards = page.locator('.result-card:visible');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) {
    const price = card.locator('.price-row');
    await expect(price).toContainText(/NT\$\s*\d/u);
    await expect(price).not.toContainText(prohibitedPriceCopy);
  }

  const estimatedCards = cards.filter({ hasText: '情境估算' });
  expect(await estimatedCards.count()).toBeGreaterThan(0);
  await expect(estimatedCards.first()).toContainText('建議預留');
  await expect(estimatedCards.first()).toContainText('CP 待實價');

  const verifiedFreeCard = cards.filter({ hasText: '北美館傍晚看展' });
  await expect(verifiedFreeCard).toContainText('NT$0');
  await expect(verifiedFreeCard.locator('.verification-mark')).toHaveCount(1);
});

test('正式結果的價格完整，UNKNOWN 預留金額在卡片、詳情與方案資訊一致', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: ShareData) => {
        (
          window as Window & {
            __pricingCompletenessSharePayload?: ShareData;
          }
        ).__pricingCompletenessSharePayload = payload;
      },
    });
  });
  await page.route('**/api/catalog/search', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: catalogPayload });
  });

  await enterFormalHome(page);
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '探索', exact: true })
    .click();

  await expect(
    page.getByRole('heading', { name: '找到 2 個合適選擇' }),
  ).toBeVisible({ timeout: 30_000 });
  const visibleCards = page.locator('.result-card:visible');
  await expect(visibleCards).toHaveCount(2);

  for (const card of await visibleCards.all()) {
    const price = card.locator('.price-row');
    await expect(price).toContainText(/NT\$\s*\d/u);
    await expect(price).not.toContainText(prohibitedPriceCopy);
  }

  const unknownCard = visibleCards.filter({ hasText: unknownFoodTitle });
  await expect(unknownCard).toHaveCount(1);
  await expect(unknownCard).toContainText('建議預留');
  await expect(unknownCard).toContainText('情境估算');
  const cardPrice = unknownCard.locator('.price-row');
  const cardAmount = firstTwdAmount(await cardPrice.innerText());

  await unknownCard.locator('.result-open').click();
  await expect(
    page.getByRole('heading', { name: unknownFoodTitle }),
  ).toBeVisible();

  const detail = page.locator('.detail-content');
  const detailPrice = page.locator('.detail-score > div').first();
  await expect(detailPrice).toContainText(/NT\$\s*\d/u);
  await expect(detailPrice).not.toContainText(prohibitedPriceCopy);
  expect(firstTwdAmount(await detailPrice.innerText())).toBe(cardAmount);
  await expect(detail).toContainText('情境估算');
  await expect(detail).toContainText('不是店家報價');

  await page.getByRole('button', { name: '查看成本與方案資訊' }).click();
  const plan = page.getByRole('dialog', { name: unknownFoodTitle });
  await expect(plan).toBeVisible();
  const planPrice = plan.locator('.evidence-grid');
  await expect(planPrice).toContainText(/NT\$\s*\d/u);
  await expect(planPrice).not.toContainText(prohibitedPriceCopy);
  expect(firstTwdAmount(await planPrice.innerText())).toBe(cardAmount);
  await expect(plan).toContainText('情境估算');
  await expect(plan).toContainText('不是店家報價');

  await page.keyboard.press('Escape');
  await expect(plan).toBeHidden();
  const detailActions = page.locator('.detail-actions');
  await detailActions
    .getByRole('button', { name: '加入這次清單', exact: true })
    .click();
  await expect(
    detailActions.getByRole('button', {
      name: '已加入這次清單',
      exact: true,
    }),
  ).toBeVisible();

  await detailActions
    .getByRole('button', { name: '分享', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __pricingCompletenessSharePayload?: ShareData;
            }
          ).__pricingCompletenessSharePayload?.text ?? null,
      ),
    )
    .not.toBeNull();
  const sharePayload = await page.evaluate(
    () =>
      (
        window as Window & {
          __pricingCompletenessSharePayload?: ShareData;
        }
      ).__pricingCompletenessSharePayload ?? null,
  );
  expect(sharePayload).toMatchObject({ title: 'ALL IN LIFE' });
  const shareText = sharePayload?.text ?? '';
  expect(shareText).toContain(unknownFoodTitle);
  expect(shareText).toContain('情境估算，不是店家報價');
  expect(firstTwdAmount(shareText)).toBe(cardAmount);

  const shareSheet = page.getByRole('dialog', {
    name: 'ALL IN LIFE 分享連結',
  });
  await expect(shareSheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(shareSheet).toBeHidden();

  await page.getByRole('button', { name: '位置交通', exact: true }).click();
  const mapCard = page.locator('.map-card');
  await expect(mapCard).toContainText(unknownFoodTitle);
  const mapPrice = mapCard.locator('p').last();
  await expect(mapPrice).toContainText('情境估算');
  await expect(mapPrice).not.toContainText(prohibitedPriceCopy);
  expect(firstTwdAmount(await mapPrice.innerText())).toBe(cardAmount);

  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: unknownFoodTitle }),
  ).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '找到 2 個合適選擇' }),
  ).toBeVisible();
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: /清單/ })
    .click();
  await expect(page.getByRole('heading', { name: '這次清單' })).toBeVisible();
  const checklistRow = page
    .locator('.checklist article')
    .filter({ hasText: unknownFoodTitle });
  await expect(checklistRow).toHaveCount(1);
  await expect(checklistRow).toContainText('情境預算');
  const checklistPrice = checklistRow.locator(':scope > strong');
  await expect(checklistPrice).not.toContainText(prohibitedPriceCopy);
  expect(firstTwdAmount(await checklistPrice.innerText())).toBe(cardAmount);
});
