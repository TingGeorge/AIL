import { expect, test } from "bun:test";

test("首頁需求輸入的螢光焦點套用在完整 component", async () => {
  const css = await Bun.file(new URL("../src/client/integration.css", import.meta.url)).text();
  expect(css).toMatch(/\.need-input:focus-within\s*\{[^}]*border-color:\s*var\(--lime\)[^}]*box-shadow:/s);
  expect(css).toMatch(/\.need-input textarea:focus,[\s\S]*?\.need-input textarea:focus-visible\s*\{[^}]*outline:\s*none/s);
});
