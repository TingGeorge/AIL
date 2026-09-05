import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NeedEditor } from "../src/client/NeedEditor.tsx";
import { ReportView } from "../src/client/ReportView.tsx";
import { EMPTY_NEED } from "../src/shared/need.ts";

function collapsedMarkup(html: string) {
  return html.replace(/(<details\b[^>]*>)([\s\S]*?)(<\/details>)/g, (_match, start, body, end) =>
    `${start}${body.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? ""}${end}`);
}

test("manual search shows primary fields and folds secondary conditions without losing controls", () => {
  const html = renderToStaticMarkup(<NeedEditor need={EMPTY_NEED} onChange={() => {}} />);
  const visible = collapsedMarkup(html);
  for (const label of ["生活需求", "總預算（新台幣）", "人數／餐點份數", "日期", "時段", "更多條件"]) {
    expect(visible).toContain(label);
  }
  for (const label of ["最遠距離（公里）", "最長步行時間（分鐘）", "可以接受需要先登記的選項嗎？", "排除成分／標籤", "其他偏好（逗號分隔）", "資格說明", "有過敏需求請向提供者確認"]) {
    expect(html).toContain(label);
    expect(visible).not.toContain(label);
  }
  expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
});

test("manual search reports active extra conditions and keeps unresolved warnings visible", () => {
  const need = { ...EMPTY_NEED, max_distance_km: 0, max_minutes: 20, registration_ok: false,
    eligibility_notes: "學生", exclude_tags: ["牛", "堅果"], soft_preferences: ["室內"], unresolved: ["日期請確認"] };
  const html = renderToStaticMarkup(<NeedEditor need={need} onChange={() => {}} />);
  const visible = collapsedMarkup(html);
  expect(visible).toContain("7 項已設定");
  expect(visible).toContain("日期請確認");
  expect(visible).toContain("已確認這些內容，繼續設定條件");
  expect(html).toContain('class="unresolved-field"');
  expect(html).not.toContain('class="notice warning"');
  expect(html).toContain('value="0"');
  expect(html).toContain('value="false" selected=""');
  expect(html).toContain('value="學生"');
  expect(html).toContain('value="堅果"');
  expect(html).toContain('value="室內"');
});

test("reports are closed by default and preserve auth and public-data warnings", () => {
  for (const token of [null, "test-session"]) {
    const html = renderToStaticMarkup(<ReportView id="test-record" token={token} onLogin={() => {}} onExpired={() => {}} />);
    expect(html).toContain('id="candidate-reports"');
    expect(collapsedMarkup(html)).toContain("回報與留言");
    expect(collapsedMarkup(html)).not.toContain("請勿填寫個人資料");
    expect(html).toContain("請勿填寫個人資料");
    expect(html).toContain(token ? "送出回報" : "登入後回報");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  }
});
