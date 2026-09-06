import { expect, test } from "bun:test";

test("PWA manifest uses the AILI icons including a maskable asset", async () => {
  const manifest = await Bun.file(new URL("../public/manifest.webmanifest", import.meta.url)).json();
  expect(manifest.name).toContain("ALL IN LIFE");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/app-icon-192.png", sizes: "192x192" }),
    expect.objectContaining({ src: "/app-icon-512.png", sizes: "512x512" }),
    expect.objectContaining({ src: "/app-icon-maskable-512.png", purpose: "maskable" }),
  ]));
});

test("readability layer keeps decision text above the old 7–10px scale", async () => {
  const css = await Bun.file(new URL("../src/client/readability.css", import.meta.url)).text();
  expect(css).toContain("Readability floor");
  expect(css).toContain(".phone-shell .result-supporting");
  expect(css).toContain(".phone-shell .detail-actions button");
  expect(css).toContain("font-size: 11px");
  expect(css).toContain("prefers-reduced-motion: reduce");
});
