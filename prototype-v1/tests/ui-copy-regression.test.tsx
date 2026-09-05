import { afterAll, beforeAll, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/client/App.tsx";
import { NeedEditor } from "../src/client/NeedEditor.tsx";
import { DetailView, ResultsView } from "../src/client/ResultsView.tsx";
import { EMPTY_NEED } from "../src/shared/need.ts";
import { rowToRec } from "../src/shared/records.ts";

const forbiddenCopy = [
  "總可比成本",
  "硬限制",
  "證據閘門",
  "候選",
  "軟偏好",
  "成本備援",
  "API key",
  "LLM",
  "Gemini",
  "PostgreSQL",
];

const exposedCopy = (html: string) => {
  const accessibleAttributes = [...html.matchAll(/\b(?:aria-label|title|alt|placeholder)="([^"]*)"/g)]
    .map((match) => match[1])
    .join(" ");
  const visibleText = html.replace(/<[^>]+>/g, " ");
  return `${visibleText} ${accessibleAttributes}`;
};

const expectNaturalProductCopy = (html: string) => {
  const copy = exposedCopy(html);
  for (const term of forbiddenCopy) expect(copy).not.toContain(term);
  expect(copy).not.toMatch(/#[0-9a-f]{3,8}\b/i);
};

const originalLocation = globalThis.location;
const originalNavigator = globalThis.navigator;
const originalSessionStorage = globalThis.sessionStorage;

const memoryStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
  clear: () => {},
  key: (_index: number) => null,
  length: 0,
};
const testLocation = { hash: "#/welcome", reload: () => {} };

beforeAll(() => {
  Object.defineProperty(globalThis, "location", { configurable: true, value: testLocation });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: memoryStorage });
});

afterAll(() => {
  Object.defineProperty(globalThis, "location", { configurable: true, value: originalLocation });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalSessionStorage });
});

test("all mounted routes render product copy without banned engineering terms", () => {
  for (const route of ["welcome", "home", "filters", "search", "results", "detail/example", "saved", "account", "settings", "offers"]) {
    testLocation.hash = `#/${route}`;
    expectNaturalProductCopy(renderToStaticMarkup(<App />));
  }
});

test("generated recommendation copy is translated while source-originated fields remain unchanged", () => {
  const item = { ...rowToRec({
    id: "f_copy",
    title: "來源保留：硬限制套餐",
    provider: "來源提供者",
    category: "食品",
    agent: "paid",
    price_total_twd: 100,
    mandatory_fees_twd: 0,
    discount_twd: 0,
    price_unit: "原文單位",
    quantity_or_servings: "一份",
    data_status: "已驗證",
    source_type: "curated",
    source_authority: "provider",
    source_url: "https://example.test/source",
    verified_at: "2026-09-05T00:00:00+08:00",
    collected_at: "2026-09-05T00:00:00+08:00",
  }), reason: "通過證據閘門與硬限制，依總可比成本排序；軟偏好僅供參考。" };
  const common = { list: [] as string[], onOpen: () => {}, onList: () => {}, onAdjust: () => {}, survival: false };
  const results = renderToStaticMarkup(<ResultsView records={[item]} pending={[]} excluded={[]} {...common} />);
  const detail = renderToStaticMarkup(<DetailView item={item} favorite={false} listed={false} onFavorite={() => {}} onList={() => {}} onReport={() => {}} />);

  for (const html of [results, detail]) {
    expect(html).toContain("來源保留：硬限制套餐");
    expect(html).toContain("原文單位");
    expect(html).toContain("預估總費用");
    expect(exposedCopy(html).replaceAll("來源保留：硬限制套餐", "")).not.toContain("硬限制");
  }
  expect(detail).toContain("檢查資料與必要條件");
  expect(detail).toContain("其他偏好");
});

test("stored tag values render as natural labels without changing the need data", () => {
  const need = { ...EMPTY_NEED, exclude_tags: ["牛", "辣", "素"] };
  const html = renderToStaticMarkup(<NeedEditor need={need} onChange={() => {}} />);
  expect(html).toMatch(/aria-pressed="true"[^>]*>牛肉<\/button>/);
  expect(html).toMatch(/aria-pressed="true"[^>]*>辣味<\/button>/);
  expect(html).toMatch(/aria-pressed="true"[^>]*>素食<\/button>/);
  expect(need.exclude_tags).toEqual(["牛", "辣", "素"]);
});

test("missing price units are omitted instead of shown as missing UI copy", () => {
  const item = rowToRec({
    id: "missing_unit",
    title: "免計價單位選項",
    provider: "來源提供者",
    category: "免費／公益資源",
    agent: "free",
    price_total_twd: 0,
    mandatory_fees_twd: 0,
    discount_twd: 0,
    price_unit: null,
    quantity_or_servings: "每人一次",
    data_status: "已驗證",
    source_type: "curated",
    source_authority: "official",
    source_url: "https://example.test/source",
    verified_at: "2026-09-05T00:00:00+08:00",
    collected_at: "2026-09-05T00:00:00+08:00",
  });
  const results = renderToStaticMarkup(<ResultsView records={[item]} pending={[]} excluded={[]} list={[]} onOpen={() => {}} onList={() => {}} onAdjust={() => {}} survival={false} />);
  const detail = renderToStaticMarkup(<DetailView item={item} favorite={false} listed={false} onFavorite={() => {}} onList={() => {}} onReport={() => {}} />);

  for (const html of [results, detail]) {
    expect(html).not.toContain("單位未提供");
    expect(html).not.toContain("計價：");
  }
});
