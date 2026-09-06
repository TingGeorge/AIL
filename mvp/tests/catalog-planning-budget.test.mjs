import assert from 'node:assert/strict';
import test from 'node:test';
import { planningBudgetForCatalogItem } from '../lib/catalog-planning-budget.mjs';

const examples = [
  {
    id: 'PLACE:food',
    categoryLabel: '食品',
    title: '便當外帶方案',
    provider: '店家待確認',
  },
  {
    id: 'PLACE:supplies',
    categoryLabel: '日用品',
    title: '24 小時臨時補給',
    provider: '社區藥局',
  },
  {
    id: 'PLACE:resource',
    categoryLabel: '免費／公益資源',
    title: '社區免費閱讀室',
    provider: '區公所',
  },
  {
    id: 'OPPORTUNITY:event',
    categoryLabel: '活動',
    title: '週末手作工作坊',
    provider: '社區中心',
  },
  {
    id: 'PLACE:transport',
    categoryLabel: '交通',
    title: '捷運單程',
    provider: '臺北捷運',
  },
];

test('五個 catalog 分類都有具體且安全的整數規劃預算', () => {
  for (const item of examples) {
    const budget = planningBudgetForCatalogItem(item);

    assert.equal(budget.kind, 'ESTIMATE');
    assert.equal(budget.policyVersion, 'planning-v1');
    assert.equal(budget.disclosure, '情境估算，不是店家報價');
    assert.ok(budget.unit.length > 0);
    assert.ok(budget.basisLabel.length > 0);
    for (const value of [budget.amountTwd, budget.minTwd, budget.maxTwd]) {
      assert.ok(Number.isSafeInteger(value));
      assert.ok(value >= 0);
    }
    assert.ok(budget.minTwd <= budget.amountTwd);
    assert.ok(budget.amountTwd <= budget.maxTwd);
  }
});

test('同一輸入的規劃預算穩定', () => {
  const item = examples[0];
  assert.deepEqual(
    planningBudgetForCatalogItem(item),
    planningBudgetForCatalogItem({ ...item }),
  );
});

test('食品與活動依標題使用不同預算區間', () => {
  const takeaway = planningBudgetForCatalogItem(examples[0]);
  const setMeal = planningBudgetForCatalogItem({
    ...examples[0],
    id: 'PLACE:set-meal',
    title: '牛排聚餐套餐',
  });
  assert.notDeepEqual(
    [takeaway.minTwd, takeaway.maxTwd],
    [setMeal.minTwd, setMeal.maxTwd],
  );

  const market = planningBudgetForCatalogItem({
    ...examples[3],
    id: 'OPPORTUNITY:market',
    title: '花博週末市集',
  });
  const performance = planningBudgetForCatalogItem({
    ...examples[3],
    id: 'OPPORTUNITY:performance',
    title: '劇場表演',
  });
  assert.notDeepEqual(
    [market.minTwd, market.maxTwd],
    [performance.minTwd, performance.maxTwd],
  );
});

test('YouBike 以 0–10 元區間並保守抓 10 元', () => {
  const budget = planningBudgetForCatalogItem({
    id: 'PLACE:station',
    categoryLabel: '交通',
    title: '捷運圓山站短程串點',
    provider: 'YouBike 2.0',
  });

  assert.equal(budget.kind, 'ESTIMATE');
  assert.equal(budget.minTwd, 0);
  assert.equal(budget.maxTwd, 10);
  assert.equal(budget.amountTwd, 10);
});

test('免費資源保留衍生支出，不被改寫為 FREE', () => {
  const budget = planningBudgetForCatalogItem(examples[2]);
  assert.equal(budget.kind, 'ESTIMATE');
  assert.ok(budget.amountTwd > 0);
  assert.match(budget.basisLabel, /衍生支出/);
});

test('飲水臺與涼適點直接使用預算為 0 元但仍是 ESTIMATE', () => {
  for (const title of ['圓山站飲水臺', '花博公園涼適點']) {
    const budget = planningBudgetForCatalogItem({
      ...examples[2],
      id: `PLACE:${title}`,
      title,
    });
    assert.equal(budget.kind, 'ESTIMATE');
    assert.equal(budget.amountTwd, 0);
    assert.equal(budget.minTwd, 0);
    assert.equal(budget.maxTwd, 0);
  }
});

test('helper 不讀寫 CatalogItem.cost 或污染輸入', () => {
  const cost = Object.freeze({
    state: 'UNKNOWN',
    amountTwd: null,
    reason: '價格待確認',
  });
  const item = Object.freeze({ ...examples[0], cost });
  const before = structuredClone(item);

  const budget = planningBudgetForCatalogItem(item);

  assert.deepEqual(item, before);
  assert.deepEqual(item.cost, cost);
  assert.equal(Object.hasOwn(budget, 'cost'), false);
  assert.notStrictEqual(budget, item);
});
