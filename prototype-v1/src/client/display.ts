import type { DataStatus } from "../shared/records.ts";

/**
 * Client-only labels. Keep the values sent to the API and stored in the
 * account/session data unchanged; these helpers are only for visible copy.
 */
export const DATA_STATUS_LABELS: Readonly<Record<DataStatus, string>> = {
  "已驗證": "已確認",
  "部分驗證／待確認": "部分確認／待確認",
  "過期／待確認": "資料可能過期／待確認",
  "衝突待確認": "資料不一致／待確認",
  "無法納入比較": "目前無法比較",
};

export function displayDataStatus(status: DataStatus): string {
  return DATA_STATUS_LABELS[status];
}

const TAG_LABELS: Readonly<Record<string, string>> = {
  牛: "牛肉",
  豬: "豬肉",
  雞: "雞肉",
  海鮮: "海鮮",
  辣: "辣味",
  素: "素食",
  含酒精: "含酒精",
};

export function displayTagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}

const AVATAR_COLOR_LABELS: Readonly<Record<string, string>> = {
  "#3b7bff": "藍色",
  "#ff4b3e": "紅色",
  "#ffe14d": "黃色",
  "#e4ff1a": "綠色",
  "#7cf2c4": "薄荷綠",
  "#c48bff": "紫色",
};

export function displayAvatarColor(color: string): string {
  return AVATAR_COLOR_LABELS[color] ?? "其他顏色";
}
