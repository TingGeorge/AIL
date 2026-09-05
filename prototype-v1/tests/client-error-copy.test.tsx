import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary } from "../src/client/ErrorBoundary.tsx";
import { ApiError, parse, search, voice } from "../src/client/api.ts";
import { EMPTY_NEED } from "../src/shared/need.ts";
import { locateErrorMessage } from "../src/client/App.tsx";

const originalFetch = globalThis.fetch;
const engineeringTerms = /Gemini|LLM|API key|PostgreSQL|database|fetch|internal|資料庫/i;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("client-facing API error copy", () => {
  test("sanitizes provider details while preserving status, code, body, and response", async () => {
    const payload = { error: "provider_failure", message: "Gemini API key rejected by PostgreSQL internal fetch" };
    const response = Response.json(payload, { status: 502 });
    globalThis.fetch = (async () => response) as unknown as typeof fetch;

    const error = await voice(new File(["audio"], "voice.webm", { type: "audio/webm" })).catch(value => value);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError).toMatchObject({ kind: "failed", status: 502, code: "provider_failure" });
    expect(apiError.body).toEqual(payload);
    expect(apiError.response).toBe(response);
    expect(apiError.message).toContain("改用文字描述");
    expect(apiError.message).not.toMatch(engineeringTerms);
  });

  test("points parsing failures back to manual conditions", async () => {
    globalThis.fetch = (async () => Response.json(
      { error: "parse_failed", message: "LLM internal database error" },
      { status: 502 },
    )) as unknown as typeof fetch;

    const error = await parse("想找晚餐", null).catch(value => value);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain("回到條件頁自行設定");
    expect((error as ApiError).message).not.toMatch(engineeringTerms);
  });

  test("points search failures back to the conditions page", async () => {
    globalThis.fetch = (async () => Response.json(
      { error: "search_failed", message: "fetch failed: internal PostgreSQL database" },
      { status: 503 },
    )) as unknown as typeof fetch;

    const error = await search(
      { need: { ...EMPTY_NEED, need: "晚餐" }, exclude: [], location: null },
      () => {},
    ).catch(value => value);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("搜尋目前無法完成，請回到條件頁重新搜尋。");
    expect((error as ApiError).message).not.toMatch(engineeringTerms);
  });

  test("keeps an already safe server message unchanged", async () => {
    const message = "搜尋服務目前無法使用，請稍後重試。";
    globalThis.fetch = (async () => Response.json(
      { error: "search_failed", message },
      { status: 503 },
    )) as unknown as typeof fetch;

    const error = await search(
      { need: EMPTY_NEED, exclude: [], location: null },
      () => {},
    ).catch(value => value);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(message);
  });
});

test("error boundary exposes an accessible, natural retry state", () => {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { failed: true };
  const html = renderToStaticMarkup(boundary.render());

  expect(html).toContain('role="alert"');
  expect(html).toContain('aria-labelledby="error-boundary-title"');
  expect(html).toContain('type="button"');
  expect(html).toContain("畫面暫時無法顯示");
  expect(html).toContain("重新載入首頁");
  expect(html).not.toMatch(engineeringTerms);
});

describe("geolocation failure copy", () => {
  test("names the fixable cause per browser error code instead of one generic message", () => {
    const denied = locateErrorMessage({ code: 1 });
    const unavailable = locateErrorMessage({ code: 2 });
    const timeout = locateErrorMessage({ code: 3 });
    expect(denied).toContain("權限");
    expect(timeout).toContain("逾時");
    expect(unavailable).toContain("訊號");
    expect(new Set([denied, unavailable, timeout]).size).toBe(3);
    for (const message of [denied, unavailable, timeout]) expect(message).toContain("距離");
  });
});
