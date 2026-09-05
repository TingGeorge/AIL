import { describe, expect, test } from "bun:test";
import { voiceCorrectionText } from "../src/client/App.tsx";
import type { VoiceResult } from "../src/shared/voice.ts";

const voiceResult = (transcript: string): VoiceResult => ({
  transcript,
  need: {
    need: "ignored full voice parse",
    target_categories: [],
    budget_total_twd: null,
    people_or_servings: 1,
    date: null,
    time_window: null,
    max_distance_km: null,
    max_minutes: null,
    free_only: false,
    registration_ok: null,
    soft_preferences: [],
    eligibility_notes: null,
    exclude_tags: [],
    unresolved: [],
  },
});

describe("一句話修正輸入", () => {
  test("語音修正只取逐字稿，交給既有 delta 修正流程", () => {
    expect(voiceCorrectionText(voiceResult("  改成三個人，預算不變  "))).toBe("改成三個人，預算不變");
    expect(() => voiceCorrectionText(voiceResult("   "))).toThrow("沒有辨識到修正內容");
  });

  test("修正區提供文字與語音模式，語音結果仍需確認後送出", async () => {
    const source = await Bun.file(new URL("../src/client/App.tsx", import.meta.url)).text();
    expect(source).toContain('aria-label="修正輸入方式"');
    expect(source).toContain('startVoice("correction")');
    expect(source).toContain("voiceCorrectionText(await api.voice");
    expect(source).toContain("parseText(true)");
  });

  test("輸入框與送出按鈕保留清楚間距", async () => {
    const css = await Bun.file(new URL("../src/client/integration.css", import.meta.url)).text();
    expect(css).toMatch(/\.correction-panel\s*\{[^}]*gap:\s*(?:1[2-9]|[2-9]\d)px/);
    expect(css).toMatch(/\.correction-panel \.field\{[^}]*margin:\s*0/);
  });
});
