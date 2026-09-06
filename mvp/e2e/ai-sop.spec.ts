import { expect, type Page, test } from '@playwright/test';

type ParseSource = 'gemini' | 'fallback';

async function enterGuestHome(page: Page) {
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

async function mockParseSource(
  page: Page,
  source: ParseSource,
  onRequest?: (headers: Record<string, string>) => void,
) {
  await page.route('**/api/v1/search/parse', async (route) => {
    onRequest?.(route.request().headers());
    const request = route.request().postDataJSON() as {
      query: string;
      defaults: {
        date: string;
        time: string;
        budgetTwd: number;
        partySize: number;
        maxDistanceM: number;
      };
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: source === 'gemini',
        source,
        constraints: {
          query: request.query,
          date: request.defaults.date,
          time: request.defaults.time,
          category: null,
          budgetTwd: request.defaults.budgetTwd,
          partySize: request.defaults.partySize,
          maxDistanceM: request.defaults.maxDistanceM,
          hardExclusions: [],
          softPreferences: ['方便外帶'],
          mobility: ['WALK'],
        },
        assumptions: source === 'gemini' ? ['以圓山生活圈為搜尋中心'] : [],
        missingFields: [],
        confidence: source === 'gemini' ? 0.94 : 0,
        error:
          source === 'fallback'
            ? {
                code: 'AI_UNAVAILABLE',
                message: 'AI 暫時無法使用，已保留目前條件。',
              }
            : null,
      }),
    });
  });
}

test('未登入也會串起 AI 需求理解、資料搜尋與推薦理由', async ({ page }) => {
  test.setTimeout(60_000);
  await mockParseSource(page, 'gemini');
  await page.route('**/api/v1/results/explain', async (route) => {
    const request = route.request().postDataJSON() as {
      candidateIds: string[];
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        source: 'gemini',
        items: request.candidateIds.map((id, index) => ({
          id,
          headline: index === 0 ? '最符合目前條件' : '符合目前條件',
          reasons: ['資料庫條件與目前需求相符'],
          caution: null,
        })),
        error: null,
      }),
    });
  });

  await enterGuestHome(page);
  await page
    .getByRole('textbox', { name: '文字輸入需求' })
    .fill('圓山附近兩個人找平價餐點，方便外帶');
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();

  await expect(
    page.getByText('Gemini 已整理以下條件，請逐項確認'),
  ).toBeVisible();
  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();

  const bridge = page.locator('.ready-ai-bridge');
  await expect(bridge).toHaveAttribute('data-ai-source', 'gemini');
  await expect(bridge).toContainText('Gemini 已轉成可編輯條件');
  await expect(bridge).toContainText('需求理解');
  await expect(bridge).toContainText('資料查詢');
  await expect(bridge).toContainText('CP 排序');
  await expect(bridge).toContainText('理由說明');

  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(page.locator('.result-card').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.results-ai-status')).toHaveAttribute(
    'data-ai-source',
    'gemini',
  );
  await expect(page.locator('.results-ai-status')).toContainText(
    'Gemini 已完成推薦理由',
  );
  await expect(page.locator('.result-card').first()).toContainText('AI 整理');
});

test('AI 未設定時會顯示規則備援且不阻斷訪客 SOP', async ({ page }) => {
  await mockParseSource(page, 'fallback');
  await enterGuestHome(page);
  await page
    .getByRole('textbox', { name: '文字輸入需求' })
    .fill('圓山附近兩個人找平價餐點，方便外帶');

  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();
  await expect(
    page.getByText('目前使用規則備援，已保留原條件供你確認'),
  ).toBeVisible();

  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();
  await expect(page.locator('.ready-ai-bridge')).toHaveAttribute(
    'data-ai-source',
    'fallback',
  );
  await expect(page.locator('.ready-ai-bridge')).toContainText(
    'AI 未連線，已切換規則備援',
  );
  await expect(page.getByRole('button', { name: '開始探索' })).toBeEnabled();
});

test('直接瀏覽資料庫不會假裝正在呼叫 AI', async ({ page }) => {
  test.setTimeout(45_000);
  await enterGuestHome(page);

  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '探索', exact: true })
    .click();
  await expect(page.locator('.result-card').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.results-ai-status')).toHaveCount(0);
});

test('帳號頁可略過登入並以匿名請求使用 AI', async ({ page }) => {
  let authorizationHeader: string | undefined;
  await mockParseSource(page, 'gemini', (headers) => {
    authorizationHeader = headers.authorization;
  });

  await page.goto('/');
  await page.getByRole('button', { name: '登入同步收藏' }).click();
  await expect(
    page.getByRole('heading', { name: '登入生活帳號' }),
  ).toBeVisible();
  await expect(page.getByText('不登入也能使用完整 AI 探索')).toBeVisible();
  await page.getByRole('button', { name: /先不用登入，使用 AI 探索/ }).click();

  await expect(
    page.getByRole('heading', { name: /今天要解決什麼/ }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: '文字輸入需求' })
    .fill('圓山附近兩個人找平價餐點，方便外帶');
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();

  await expect(
    page.getByText('Gemini 已整理以下條件，請逐項確認'),
  ).toBeVisible();
  expect(authorizationHeader).toBeUndefined();
});

test('三個模式按鈕會把對應 EX 範例帶入原輸入框，且仍可編輯', async ({
  page,
}) => {
  await enterGuestHome(page);

  const input = page.getByRole('textbox', { name: '文字輸入需求' });
  const modeCards = page.locator('.mode-card');
  await expect(page.locator('.prompt-example-panel')).toHaveCount(0);

  await modeCards.filter({ hasText: '日常' }).click();
  await expect(input).toHaveValue(
    '今晚兩個人在圓山吃晚餐，每人 NT$250，不吃堅果，最好可以外帶',
  );
  await expect(
    page.getByText('EX 範例已帶入，可用語音或打字修改'),
  ).toBeVisible();

  await modeCards.filter({ hasText: '揪團' }).click();
  await expect(input).toHaveValue(
    '週末想揪 6 人在圓山吃火鍋，每人預算 NT$500，希望可以訂位',
  );

  await modeCards.filter({ hasText: '零元' }).click();
  await expect(input).toHaveValue(
    '週末想找圓山附近的免費展覽或活動，步行 2 公里內，最好有冷氣',
  );

  await input.fill('我想改成今晚的免費展覽');
  await expect(input).toHaveValue('我想改成今晚的免費展覽');
  await expect(
    page.getByRole('button', { name: '用語音說需求' }),
  ).toBeVisible();

  const cardHeight = await modeCards
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(cardHeight).toBeLessThan(90);
});
