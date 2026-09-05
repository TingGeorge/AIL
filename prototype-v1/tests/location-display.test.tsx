import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailView, ResultsView } from "../src/client/ResultsView.tsx";
import { distanceDisplay, estimatedDistanceKm, locationFailureStatus, requestUserPosition } from "../src/client/location.ts";
import type { Rec } from "../src/shared/records.ts";

const rec = (overrides: Partial<Rec> = {}): Rec => ({
  id: "r1",
  category: "食品",
  title: "測試地點",
  provider: "來源店家",
  price_total_twd: 100,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: null,
  quantity_or_servings: null,
  eligibility: [],
  registration_required: false,
  availability_or_event_time: null,
  distance_or_time_text: "步行時間請自行確認",
  address: "台北市測試路 1 號",
  lat: 25.0478,
  lng: 121.5319,
  valid_until: null,
  source_url: "https://example.com/source",
  source_type: "curated",
  source_authority: "official",
  evidence: [],
  collected_at: "2026-09-05T08:00:00+08:00",
  verified_at: "2026-09-05T09:00:00+08:00",
  data_status: "已驗證",
  agent: "paid",
  action_label: null,
  action_url: null,
  extra: {},
  baseline: null,
  tags: null,
  group_offer: null,
  distance_km: null,
  reason: null,
  ...overrides,
});

const actions = {
  list: [],
  onOpen: () => {},
  onList: () => {},
  onAdjust: () => {},
  survival: false,
};

test("距離格式明示為直線估算，短距離使用公尺", () => {
  const km = estimatedDistanceKm(rec(), { lat: 25.0462, lng: 121.5175 });
  expect(km).not.toBeNull();
  expect(distanceDisplay(0.35, "available")).toBe("直線距離約 350 公尺");
  expect(distanceDisplay(1.24, "available")).toBe("直線距離約 1.2 公里");
});

test("結果卡在允許定位後顯示估算距離", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    ...actions,
    records: [rec()],
    pending: [],
    excluded: [],
    position: { lat: 25.0462, lng: 121.5175 },
    locationStatus: "available",
  }));
  expect(html).toContain("距離");
  expect(html).toMatch(/直線距離約 [\d.]+ 公里/);
});

test("拒絕分享位置時距離顯示無法提供", () => {
  const denied = renderToStaticMarkup(createElement(ResultsView, {
    ...actions,
    records: [rec()],
    pending: [],
    excluded: [],
    position: null,
    locationStatus: "denied",
  }));
  expect(denied).toContain("距離");
  expect(denied).toContain("無法提供");
});

test("使用者已允許但定位技術失敗時顯示未提供", () => {
  expect(locationFailureStatus({ code: 2 })).toBe("unavailable");
  expect(locationFailureStatus({ code: 3 })).toBe("unavailable");
  expect(locationFailureStatus({ code: 1 })).toBe("denied");
  expect(distanceDisplay(null, "unavailable")).toBe("未提供");
});

test("已取得使用者位置但項目未提供座標時顯示未提供", () => {
  const missingCoordinates = renderToStaticMarkup(createElement(ResultsView, {
    ...actions,
    records: [rec({ lat: null, lng: null })],
    pending: [],
    excluded: [],
    position: { lat: 25.0462, lng: 121.5175 },
    locationStatus: "available",
  }));
  expect(missingCoordinates).toContain("距離");
  expect(missingCoordinates).toContain("未提供");
  expect(missingCoordinates).not.toContain("無法提供");
});

test("詳情不顯示經緯度，原座標欄改為距離", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec(),
    favorite: false,
    listed: false,
    position: { lat: 25.0462, lng: 121.5175 },
    locationStatus: "available",
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));
  expect(html).toContain("距離");
  expect(html).toContain("直線距離約");
  expect(html).not.toContain("座標");
  expect(html).not.toContain("25.0478, 121.5319");
});

test("啟動定位 helper 會呼叫瀏覽器 geolocation 並回傳位置", async () => {
  let calls = 0;
  const geolocation = {
    getCurrentPosition(success: PositionCallback) {
      calls += 1;
      success({ coords: { latitude: 25.04, longitude: 121.52 } } as GeolocationPosition);
    },
  } as Geolocation;
  await expect(requestUserPosition(geolocation)).resolves.toEqual({ lat: 25.04, lng: 121.52 });
  expect(calls).toBe(1);
});

test("查詢條件頁不再顯示第二次定位詢問", async () => {
  const source = await Bun.file(new URL("../src/client/App.tsx", import.meta.url)).text();
  expect(source).not.toContain('className="location-panel"');
  expect(source).not.toContain("只在這次搜尋使用定位");
  expect(source).not.toContain("重新允許定位");
});
