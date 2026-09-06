import { expect, test } from '@playwright/test';

test('catalog items API restores a searched item by stable id', async ({
  request,
}) => {
  const searchResponse = await request.get('/api/catalog/search?limit=25');
  expect(searchResponse.ok()).toBe(true);
  const search = (await searchResponse.json()) as {
    source: string;
    items: Array<{ id: string; title: string }>;
  };
  expect(search.items.length).toBeGreaterThan(0);

  const expected = search.items[0];
  const lookupResponse = await request.get(
    `/api/catalog/items?ids=${encodeURIComponent(`${expected.id},PLACE:missing`)}`,
  );
  expect(lookupResponse.ok()).toBe(true);
  expect(lookupResponse.headers()['cache-control']).toContain('no-store');

  const lookup = (await lookupResponse.json()) as {
    source: string;
    items: Array<{ id: string; title: string }>;
    missingIds: string[];
  };
  expect(lookup.source).toMatch(/^(d1|snapshot)$/);
  expect(lookup.items).toEqual([
    expect.objectContaining({ id: expected.id, title: expected.title }),
  ]);
  expect(lookup.missingIds).toEqual(['PLACE:missing']);
});

test('catalog items API rejects malformed and oversized id lists', async ({
  request,
}) => {
  const malformed = await request.get('/api/catalog/items?ids=demo-only-id');
  expect(malformed.status()).toBe(400);
  await expect(malformed.json()).resolves.toMatchObject({
    error: 'INVALID_IDS',
  });

  const oversizedIds = Array.from(
    { length: 101 },
    (_, index) => `PLACE:item_${index}`,
  ).join(',');
  const oversized = await request.get(
    `/api/catalog/items?ids=${encodeURIComponent(oversizedIds)}`,
  );
  expect(oversized.status()).toBe(400);
  await expect(oversized.json()).resolves.toMatchObject({
    error: 'TOO_MANY_IDS',
  });
});

test('a catalog detail hash restores the matching item after a reload', async ({
  page,
  request,
}) => {
  const searchResponse = await request.get('/api/catalog/search?limit=25');
  const search = (await searchResponse.json()) as {
    items: Array<{ id: string; title: string }>;
  };
  const expected = search.items[0];

  await page.goto(`/#/detail/${encodeURIComponent(expected.id)}`);

  await expect(page).toHaveURL(
    new RegExp(`#/detail/${encodeURIComponent(expected.id)}$`),
  );
  await expect(
    page.getByRole('heading', { name: expected.title }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.detail-hero')).toBeVisible();
});

test('browser back returns from a pushed app route to the previous screen', async ({
  page,
}) => {
  await page.goto('/#/home');
  await expect(
    page.getByRole('heading', { name: /今天要解決什麼/ }),
  ).toBeVisible();

  await page.locator('.quick-team').click();
  await expect(page).toHaveURL(/#\/team$/);
  await expect(page.getByRole('heading', { name: '一起省更多' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(
    page.getByRole('heading', { name: /今天要解決什麼/ }),
  ).toBeVisible();
});
