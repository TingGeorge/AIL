import { generateStructured, geminiConfigured } from "./gemini.ts";
import { needSchema, type Need, CATEGORIES } from "../shared/need.ts";

export const NEED_SYSTEM = `你是「ALL in life」的需求解析器。把使用者的一句話（逐字稿或文字）轉成需求與限制 JSON。
規則：
- 固定區域是圓山區，不要放進任何欄位；使用者提到其他地區時放進 unresolved。
- 沒提到的欄位回傳 null 或空陣列，絕不用常識補值。
- 數字正規化：兩人→2、三百／三百塊／NT$300→300、二十分鐘內→max_minutes 20、兩公里內→max_distance_km 2。
- 「今天」→ today；「這週末」→ date 為下一個週六的 ISO 日期且 time_window 為「週末」。
- 「免費」「不用付費」→ free_only true；「可以先登記」→ registration_ok true。
- 「可外帶」「素食」等放 soft_preferences。
- 「不吃牛」「不要海鮮」「不吃辣」→ exclude_tags 用單一詞：牛、豬、雞、海鮮、辣、素、含酒精。
- 聽到但對不上任何欄位的片語（例如「靠近捷運站」「便宜一點」）原樣放進 unresolved。
- target_categories 只能從 ${CATEGORIES.join("、")} 挑選，依需求判斷可能相關的類別。
- need 是使用者想完成的事，例如「晚餐」；聽不出來就給空字串。
- 若提供 current，這是一句修正語句：以 current 為基礎，只改動這句話提到的欄位，其餘欄位原樣回傳。
  例：current 人數 2 預算 300，「改成三個人」→ 人數 3、預算 300。「預算不限」→ budget_total_twd null。
- 所有字串用繁體中文。只輸出 JSON。`;

export const parseConfigured = geminiConfigured;

export async function parseNeed(input: { transcript: string; current: Need | null; today: string }, signal?: AbortSignal): Promise<Need> {
  return generateStructured({
    signal,
    schema: needSchema,
    system: NEED_SYSTEM,
    input: [{ type: "text", text: JSON.stringify(input) }],
  });
}
