import { afterEach, describe, expect, test } from "bun:test";
import { ApiError, voice } from "../src/client/api.ts";
import { prepareVoiceReview, voiceResultIsCurrent } from "../src/client/App.tsx";
import { audioMimeEssence, canonicalAudioMimeType, recordedAudioFile, scheduleRecordingLimit } from "../src/client/recorder.ts";
import { defaultAccountSettings } from "../src/shared/account.ts";
import { EMPTY_NEED } from "../src/shared/need.ts";
import type { VoiceResult } from "../src/shared/voice.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const result:VoiceResult = {
  transcript: "兩人晚餐，三百元，不吃牛",
  need: { ...EMPTY_NEED, need: "晚餐", target_categories: ["食品"], people_or_servings: 2, budget_total_twd: 300, exclude_tags: ["牛"] },
};

describe("voice client API", () => {
  test("posts one multipart audio File without replacing its MIME or filename", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    globalThis.fetch = (async (url, init) => {
      requestedUrl = String(url); requestedInit = init;
      return Response.json(result);
    }) as typeof fetch;

    const audio = new File([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], "voice.ogg", { type: "audio/ogg" });
    expect(await voice(audio)).toEqual(result);
    expect(requestedUrl).toBe("/api/voice");
    expect(requestedInit?.method).toBe("POST");
    expect(new Headers(requestedInit?.headers).has("content-type")).toBe(false);
    const form = requestedInit?.body as FormData;
    const uploaded = form.get("audio");
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe("voice.ogg");
    expect((uploaded as File).type).toBe("audio/ogg");
    expect([...form.keys()]).toEqual(["audio"]);
  });

  test("surfaces server errors and rejects malformed voice results", async () => {
    globalThis.fetch = (async () => Response.json({ error: "voice_failed", message: "不支援的音訊格式" }, { status: 415 })) as unknown as typeof fetch;
    await expect(voice(new File(["bad"], "voice.webm", { type: "audio/webm" }))).rejects.toMatchObject({
      name: "Error", status: 415, message: "不支援的音訊格式",
    });

    globalThis.fetch = (async () => Response.json({ transcript: "只有逐字稿" })) as unknown as typeof fetch;
    try {
      await voice(new File(["audio"], "voice.webm", { type: "audio/webm" }));
      throw new Error("expected malformed response to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Error).message).toBe("語音服務回應格式不正確。");
    }
  });
});

describe("recorded audio metadata", () => {
  test("keeps native WebM/OGG and canonicalizes Safari MP4 audio to M4A", () => {
    expect(canonicalAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    expect(canonicalAudioMimeType("audio/ogg; codecs=opus")).toBe("audio/ogg;codecs=opus");
    expect(canonicalAudioMimeType("audio/mp4;codecs=mp4a.40.2")).toBe("audio/m4a;codecs=mp4a.40.2");
    expect(audioMimeEssence("audio/m4a;codecs=mp4a.40.2")).toBe("audio/m4a");

    const safari = recordedAudioFile([new Uint8Array([0, 0, 0, 0])], "audio/mp4;codecs=mp4a.40.2");
    expect(safari.name).toBe("voice.m4a");
    expect(safari.type).toBe("audio/m4a;codecs=mp4a.40.2");
    const chrome = recordedAudioFile(["webm"], "audio/webm;codecs=opus");
    expect(chrome.name).toBe("voice.webm");
    expect(chrome.type).toBe("audio/webm;codecs=opus");
  });

  test("fails closed for an unknown recorder MIME instead of uploading relabelled bytes", () => {
    expect(() => recordedAudioFile(["unknown"], "application/octet-stream")).toThrow("不支援的錄音格式");
  });
});

describe("voice review and stale-result guards", () => {
  test("opens a parsed human-review state and applies only the existing budget default", () => {
    const now = new Date("2026-09-05T12:00:00+08:00");
    const settings = { ...defaultAccountSettings(now), monthly_budget: 1000, spent: 250 };
    const review = prepareVoiceReview({ ...result, need: { ...result.need, budget_total_twd: null, free_only: true } }, settings, now);
    expect(review).toMatchObject({
      transcript: result.transcript,
      need: { need: "晚餐", budget_total_twd: 750, free_only: true },
      budgetFromSettings: true,
      parsed: true,
      reviewStarted: true,
      mode: "zero",
    });
    expect(prepareVoiceReview(result, settings, now).need.budget_total_twd).toBe(300);
  });

  test("discards an aborted response or a response older than transcript edits", () => {
    const controller = new AbortController();
    expect(voiceResultIsCurrent(controller.signal, 2, 2)).toBe(true);
    expect(voiceResultIsCurrent(controller.signal, 2, 3)).toBe(false);
    controller.abort();
    expect(voiceResultIsCurrent(controller.signal, 2, 2)).toBe(false);
  });
});

// The UI uses this scheduler: seconds must not accidentally become milliseconds.
test("recording deadline is 30 seconds, not 30 milliseconds", () => {
  const original = globalThis.setTimeout;
  let delay: number | undefined;
  let scheduled: (() => void) | undefined;
  let stopped = false;
  try {
    globalThis.setTimeout = ((callback: () => void, ms: number) => {
      scheduled = callback; delay = ms; return 1;
    }) as unknown as typeof setTimeout;
    scheduleRecordingLimit(() => { stopped = true; });
    expect(delay).toBe(30_000);
    expect(stopped).toBe(false);
    scheduled!();
    expect(stopped).toBe(true);
  } finally { globalThis.setTimeout = original; }
});
