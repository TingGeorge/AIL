import { expect, type Page, test } from '@playwright/test';

async function skipIntoHome(page: Page, url = '/?mode=demo') {
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

test('公開首頁顯示來源、串接與驗證統計，訪客可直接查看清單', async ({
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
  await expect(
    coverage.getByRole('button', { name: '登入同步收藏與清單' }),
  ).toHaveCount(0);

  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '清單', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '這次清單' })).toBeVisible();
  await expect(page.getByText('還沒有清單項目')).toBeVisible();
});

test('正式模式不填需求也可直接瀏覽資料庫，並按距離排序', async ({ page }) => {
  test.setTimeout(60_000);
  let parseRequestCount = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/search/parse') {
      parseRequestCount += 1;
    }
  });

  await skipIntoHome(page, '/');
  await expect(page.getByRole('textbox', { name: '文字輸入需求' })).toHaveValue(
    '',
  );

  const catalogRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/catalog/search' &&
      request.method() === 'POST',
    { timeout: 30_000 },
  );
  const catalogResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/catalog/search' &&
      response.ok(),
    { timeout: 30_000 },
  );
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: '探索', exact: true })
    .click();

  const catalogRequest = await catalogRequestPromise;
  expect(catalogRequest.postDataJSON()).toMatchObject({
    category: 'ALL',
    limit: 100,
  });
  await catalogResponsePromise;
  await expect(page.getByText('請至少用 3 個字描述這次需求。')).toHaveCount(0);
  await expect(page.locator('.result-card').first()).toBeVisible({
    timeout: 30_000,
  });
  expect(parseRequestCount).toBe(0);

  const sortControl = page.locator('.sort-button');
  await expect(sortControl).toBeVisible();
  await expect(sortControl).toContainText('距離：近到遠');

  const distances = await page
    .locator('.result-card .result-copy')
    .evaluateAll((copies) =>
      copies
        .map((copy) =>
          Number(copy.textContent?.match(/(\d+(?:\.\d+)?)\s*km/i)?.[1]),
        )
        .filter(Number.isFinite)
        .slice(0, 8),
    );
  expect(distances.length).toBeGreaterThan(1);
  for (let index = 1; index < distances.length; index += 1) {
    expect(distances[index]).toBeGreaterThanOrEqual(distances[index - 1]);
  }
});

test('正式訪客不會繼承展示帳本或免登入操作', async ({ page }) => {
  await skipIntoHome(page, '/');

  await expect(
    page.getByRole('button', { name: '查看本月消費分析' }),
  ).toHaveCount(0);
  await expect(page.getByText('尚未設定月預算')).toBeVisible();

  await page.getByRole('button', { name: '揪團', exact: true }).click();
  await page.getByRole('button', { name: '加入這一團' }).click();
  await expect(
    page.getByRole('heading', { name: '登入生活帳號' }),
  ).toBeVisible();
});

test('分類維持單列且可左右拖曳，並只替已驗證項目顯示勾勾', async ({ page }) => {
  await skipIntoHome(page, '/?mode=demo');
  await reachDemoResults(page);

  const categoryFilter = page.locator('.category-filter');
  const categoryLayout = await categoryFilter.evaluate((element) => {
    const buttons = [...element.querySelectorAll('button')];
    return {
      display: getComputedStyle(element).display,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rows: new Set(buttons.map((button) => button.offsetTop)).size,
    };
  });
  expect(categoryLayout.display).toBe('flex');
  expect(categoryLayout.scrollWidth).toBeGreaterThan(
    categoryLayout.clientWidth,
  );
  expect(categoryLayout.rows).toBe(1);
  await page.setViewportSize({ width: 360, height: 844 });
  const narrowCategoryLayout = await categoryFilter.evaluate((element) => {
    const buttons = [...element.querySelectorAll('button')];
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rows: new Set(buttons.map((button) => button.offsetTop)).size,
    };
  });
  expect(narrowCategoryLayout.scrollWidth).toBeGreaterThan(
    narrowCategoryLayout.clientWidth,
  );
  expect(narrowCategoryLayout.rows).toBe(1);
  for (const category of [
    '全部',
    '食品',
    '日用品',
    '免費／公益資源',
    '活動',
    '交通',
  ]) {
    await expect(
      categoryFilter.getByRole('button', { name: new RegExp(`^${category}`) }),
    ).toBeVisible();
  }

  await categoryFilter.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const filterBox = await categoryFilter.boundingBox();
  if (!filterBox) throw new Error('category filter is not visible');
  await page.mouse.move(
    filterBox.x + filterBox.width - 20,
    filterBox.y + filterBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(filterBox.x + 30, filterBox.y + filterBox.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect
    .poll(() => categoryFilter.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);

  const dailyCategory = categoryFilter.getByRole('button', {
    name: /^日用品/,
  });
  await dailyCategory.click();
  await expect(dailyCategory).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(page.locator('.result-card').first()).toContainText('日用品');

  const allCategory = categoryFilter.getByRole('button', { name: /^全部/ });
  await allCategory.click();
  await expect(allCategory).toHaveAttribute('aria-pressed', 'true');

  const verifiedCard = page
    .locator('.result-card.provenance-verified-demo')
    .first();
  await expect(verifiedCard).toBeVisible();
  await expect(
    verifiedCard.locator('.result-verification-mark'),
  ).toHaveAttribute('title', /已驗證/);
  await expect(
    page
      .locator('.result-card.provenance-simulated')
      .first()
      .locator('.result-verification-mark'),
  ).toHaveCount(0);

  const layout = await verifiedCard.evaluate((card) => {
    const open = card.querySelector<HTMLElement>('.result-open');
    if (!open) throw new Error('result-open is missing');
    const art = open.querySelector<HTMLElement>('.result-art');
    const mark = card.querySelector<HTMLElement>('.result-verification-mark');
    const icon = mark?.querySelector<SVGElement>('svg');
    const save = card.querySelector<HTMLElement>('.save-fab');
    const saveIcon = save?.querySelector<SVGElement>('svg');
    const cardRect = card.getBoundingClientRect();
    const openRect = open.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const markRect = mark?.getBoundingClientRect();
    const iconRect = icon?.getBoundingClientRect();
    const saveRect = save?.getBoundingClientRect();
    const saveIconRect = saveIcon?.getBoundingClientRect();
    return {
      openHeight: openRect.height,
      artHeight: artRect?.height ?? 0,
      artPosition: art ? getComputedStyle(art).position : '',
      markRight: markRect ? cardRect.right - markRect.right : -1,
      markBottom: markRect ? cardRect.bottom - markRect.bottom : -1,
      iconCenterX:
        markRect && iconRect
          ? iconRect.left +
            iconRect.width / 2 -
            (markRect.left + markRect.width / 2)
          : -1,
      iconCenterY:
        markRect && iconRect
          ? iconRect.top +
            iconRect.height / 2 -
            (markRect.top + markRect.height / 2)
          : -1,
      saveRight: saveRect ? cardRect.right - saveRect.right : -1,
      saveTop: saveRect ? saveRect.top - cardRect.top : -1,
      saveIconCenterX:
        saveRect && saveIconRect
          ? saveIconRect.left +
            saveIconRect.width / 2 -
            (saveRect.left + saveRect.width / 2)
          : -1,
      saveIconCenterY:
        saveRect && saveIconRect
          ? saveIconRect.top +
            saveIconRect.height / 2 -
            (saveRect.top + saveRect.height / 2)
          : -1,
    };
  });
  expect(layout.artPosition).toBe('absolute');
  expect(Math.abs(layout.openHeight - layout.artHeight)).toBeLessThanOrEqual(1);
  expect(layout.markRight).toBeGreaterThanOrEqual(11);
  expect(layout.markRight).toBeLessThanOrEqual(14);
  expect(layout.markBottom).toBeGreaterThanOrEqual(11);
  expect(layout.markBottom).toBeLessThanOrEqual(14);
  expect(Math.abs(layout.iconCenterX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(layout.iconCenterY)).toBeLessThanOrEqual(0.5);
  expect(layout.saveRight).toBeGreaterThanOrEqual(11);
  expect(layout.saveRight).toBeLessThanOrEqual(14);
  expect(layout.saveTop).toBeGreaterThanOrEqual(11);
  expect(layout.saveTop).toBeLessThanOrEqual(14);
  expect(Math.abs(layout.saveIconCenterX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(layout.saveIconCenterY)).toBeLessThanOrEqual(0.5);

  await verifiedCard.locator('.result-open').click();
  await expect(page.locator('.detail-verification-mark')).toHaveAttribute(
    'title',
    /已驗證/,
  );
});

test('排序使用就地下拉選單，不開啟對話框', async ({ page }) => {
  await skipIntoHome(page, '/?mode=demo');
  await reachDemoResults(page);

  const picker = page.locator('.sort-picker');
  const trigger = picker.locator('summary');
  await trigger.click();

  await expect(picker).toHaveAttribute('open', '');
  await expect(picker.getByRole('group', { name: '排序方式' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '排序結果' })).toHaveCount(0);

  await picker.getByRole('button', { name: /價格：低到高/ }).click();
  await expect(picker).not.toHaveAttribute('open', '');
  await expect(trigger).toContainText('價格：低到高');
});

test('條件欄位維持精簡比例，CP 滑桿在亮暗色都有清楚軌道', async ({ page }) => {
  await skipIntoHome(page, '/?mode=demo');
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();

  const fieldMetrics = await page
    .locator('.filters-screen')
    .evaluate((screen) => {
      const needField = screen.querySelector<HTMLElement>('.need-field');
      const textarea = screen.querySelector<HTMLElement>(
        '.need-field textarea',
      );
      const basicField = screen.querySelector<HTMLElement>(
        '.filter-basics .field-label',
      );
      const basicInput = screen.querySelector<HTMLElement>(
        '.filter-basics input',
      );
      if (!needField || !textarea || !basicField || !basicInput) {
        throw new Error('constraint fields are missing');
      }
      return {
        needHeight: needField.getBoundingClientRect().height,
        textareaHeight: textarea.getBoundingClientRect().height,
        basicHeight: basicField.getBoundingClientRect().height,
        inputHeight: basicInput.getBoundingClientRect().height,
        inputFontSize: Number.parseFloat(getComputedStyle(basicInput).fontSize),
      };
    });
  expect(fieldMetrics.needHeight).toBeLessThan(90);
  expect(fieldMetrics.textareaHeight).toBeLessThanOrEqual(48);
  expect(fieldMetrics.basicHeight).toBeLessThan(74);
  expect(fieldMetrics.inputHeight).toBeLessThanOrEqual(40);
  expect(fieldMetrics.inputFontSize).toBeGreaterThanOrEqual(10);

  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();
  await page.getByRole('button', { name: '開始探索' }).click();
  await expect(page.locator('.result-card').first()).toBeVisible();
  await page.locator('.cp-formula > summary').click();

  const readSliderStyle = () =>
    page.locator('.formula-controls').evaluate((controls) => {
      const track = controls.querySelector<HTMLElement>(
        '[data-slot="slider-track"]',
      );
      const range = controls.querySelector<HTMLElement>(
        '[data-slot="slider-range"]',
      );
      const thumb = controls.querySelector<HTMLElement>(
        '[data-slot="slider-thumb"]',
      );
      if (!track || !range || !thumb) throw new Error('CP slider is missing');
      const trackStyle = getComputedStyle(track);
      const rangeStyle = getComputedStyle(range);
      const thumbStyle = getComputedStyle(thumb);
      return {
        trackHeight: track.getBoundingClientRect().height,
        trackBackground: trackStyle.backgroundColor,
        trackBorder: trackStyle.borderTopWidth,
        rangeBackground: rangeStyle.backgroundImage,
        thumbWidth: thumb.getBoundingClientRect().width,
        thumbBorder: thumbStyle.borderTopWidth,
      };
    });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const darkSlider = await readSliderStyle();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  const lightSlider = await readSliderStyle();

  for (const slider of [darkSlider, lightSlider]) {
    expect(slider.trackHeight).toBeGreaterThanOrEqual(8);
    expect(slider.trackBorder).toBe('1px');
    expect(slider.rangeBackground).toContain('linear-gradient');
    expect(slider.thumbWidth).toBeGreaterThanOrEqual(18);
    expect(slider.thumbBorder).toBe('3px');
  }
  expect(lightSlider.trackBackground).not.toBe(darkSlider.trackBackground);
});

test('預設探索以資料庫 facets 顯示所有分類與完整筆數', async ({ page }) => {
  test.setTimeout(60_000);
  await skipIntoHome(page, '/');
  await page
    .getByRole('textbox', { name: '文字輸入需求' })
    .fill('想找兩人晚餐');
  await page.getByRole('button', { name: '下一步：確認需求與限制' }).click();
  await page.getByRole('button', { name: '確認完成，前往開始探索' }).click();
  const catalogResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/catalog/search') && response.ok(),
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: '開始探索' }).click();
  const payload = (await (await catalogResponse).json()) as {
    source: string;
    facets: Array<{ label: string; count: number }>;
  };
  await expect(
    page.getByRole('heading', { name: /找到 \d+ 個合適選擇/ }),
  ).toBeVisible({ timeout: 30_000 });

  expect(['d1', 'snapshot']).toContain(payload.source);
  const filter = page.locator('.category-filter');
  const total = payload.facets.reduce((sum, facet) => sum + facet.count, 0);
  const formattedTotal = total.toLocaleString('en-US');
  await expect(
    filter.getByRole('button', {
      name: new RegExp(`^全部 ${formattedTotal}$`),
    }),
  ).toBeVisible();
  for (const facet of payload.facets) {
    await expect(
      filter.getByRole('button', {
        name: `${facet.label} ${facet.count} 筆`,
      }),
    ).toBeVisible();
  }

  const foodResponsePromise = page.waitForResponse(
    (response) => {
      if (!response.url().endsWith('/api/catalog/search') || !response.ok())
        return false;
      return response.request().postDataJSON()?.category === 'FOOD';
    },
    { timeout: 30_000 },
  );
  await filter.getByRole('button', { name: /^食品 / }).click();
  const foodResponse = await foodResponsePromise;
  const foodPayload = (await foodResponse.json()) as {
    items: Array<{ categoryKey: string }>;
  };
  expect(foodPayload.items.length).toBeGreaterThan(0);
  expect(foodPayload.items.every((item) => item.categoryKey === 'FOOD')).toBe(
    true,
  );
  await expect(page.locator('.result-card').first()).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await page
      .locator('.result-art span')
      .evaluateAll((labels) =>
        labels.every((label) => label.textContent === '食品'),
      ),
  ).toBe(true);
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
  const compactFoodCard = page
    .locator('.result-card')
    .filter({ hasText: '麵食快餐方案' });
  await expect(compactFoodCard).toBeVisible();
  await expect(compactFoodCard.locator('.result-copy')).toContainText(
    '店家待確認',
  );
  await expect(compactFoodCard).not.toContainText('圓山生活圈餐飲資料');
});

test('未登入收藏會保存在目前瀏覽器並於重新整理後還原', async ({ page }) => {
  await skipIntoHome(page);
  await reachDemoResults(page);

  const firstCard = page.locator('.result-card').first();
  const savedTitle = (
    await firstCard.locator('.result-title').innerText()
  ).trim();
  await firstCard.getByRole('button', { name: '加入清單' }).click();
  await expect(page.getByText('已收藏在這個瀏覽器')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = window.localStorage.getItem(
          'all-in-life:guest-saved-v1',
        );
        if (!stored) return 0;
        const parsed = JSON.parse(stored) as { saved?: unknown[] };
        return Array.isArray(parsed.saved) ? parsed.saved.length : 0;
      }),
    )
    .toBe(1);

  await page.reload();
  const welcomeAction = page.getByRole('button', { name: '立即開始探索' });
  const bottomNav = page.locator('.bottom-nav');
  await expect
    .poll(
      async () =>
        (await bottomNav.isVisible()) || (await welcomeAction.isEnabled()),
    )
    .toBe(true);
  if (!(await bottomNav.isVisible())) {
    await welcomeAction.click();
    const tutorial = page.getByRole('dialog', { name: '使用教學' });
    if (await tutorial.isVisible()) {
      await tutorial.getByRole('button', { name: '略過教學' }).click();
    }
    const skip = page.getByRole('button', { name: '略過', exact: true });
    if (await skip.isVisible()) await skip.click();
  }
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: /清單/ })
    .click();
  await expect(page.getByText(savedTitle, { exact: true })).toBeVisible();
});

test('登入後收藏會寫入帳號並在重新整理後還原', async ({ page }) => {
  test.setTimeout(60_000);
  const username = `e2e_${Date.now().toString(36)}`;
  const password = 'AllInLife!2026';

  await page.goto('/');
  await page.getByRole('button', { name: '登入同步收藏' }).click();
  await page.getByRole('tab', { name: '註冊' }).click();
  await page.getByPlaceholder('顯示名稱（選填）').fill('儲存測試');
  await page.getByPlaceholder('3–30 個英數字、_ 或 -').fill(username);
  await page.getByPlaceholder('至少 12 個字元').fill(password);
  await page.getByRole('button', { name: '建立帳號並登入' }).click();
  await expect(page.locator('body')).toContainText('嗨，儲存測試');

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
  const accountAction = page.getByRole('button', { name: '登入同步收藏' });
  if (await accountAction.isVisible()) {
    await accountAction.click();
    await expect(page.getByText(`@${username}`)).toBeVisible();
    await page.getByRole('button', { name: '繼續探索' }).click();
  }
  await page
    .locator('.bottom-nav')
    .getByRole('button', { name: /清單/ })
    .click();
  await expect(page.getByText(savedTitle, { exact: true })).toBeVisible();
});
