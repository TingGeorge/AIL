import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NeedEditor } from "../src/client/NeedEditor.tsx";
import { EMPTY_NEED } from "../src/shared/need.ts";

test("date and time use a dedicated responsive grid", () => {
  const html = renderToStaticMarkup(<NeedEditor need={EMPTY_NEED} onChange={() => {}} />);
  const schedule = html.match(/<div class="field-grid schedule-grid">([\s\S]*?)<\/div>/)?.[1] ?? "";

  expect(schedule).toContain('type="date"');
  expect(schedule).toContain("時段");
  expect(schedule).not.toContain("總預算");
});

test("native date controls keep their padding outside the WebKit-sized input", async () => {
  const html = renderToStaticMarkup(<NeedEditor need={EMPTY_NEED} onChange={() => {}} />);
  const css = (await Bun.file(new URL("../src/client/integration.css", import.meta.url)).text()).replace(/\s+/g, "");
  const dateRule = css.match(/\.date-input-shell>input\[type="date"\]\{([^}]*)\}/)?.[1] ?? "";

  expect(html).toContain('class="date-input-shell"');
  expect(css).toContain(".date-input-shell{");
  expect(dateRule).toContain("inline-size:100%");
  expect(dateRule).toContain("padding:0");
});

test("mobile form and scroll containers explicitly contain horizontal sizing", async () => {
  const css = (await Bun.file(new URL("../src/client/integration.css", import.meta.url)).text()).replace(/\s+/g, "");

  expect(css).toContain("inline-size:100%;min-inline-size:0;max-inline-size:100%");
  expect(css).toContain(".screen,.results-page,.detail-scroll-region{overflow-x:hidden;}");
});

test("mobile layout reserves safe-area space instead of compressing navigation controls", async () => {
  const css = await Bun.file(new URL("../src/client/integration.css", import.meta.url)).text();

  expect(css).toContain("--app-safe-bottom:env(safe-area-inset-bottom,0px)");
  expect(css).toContain("height:calc(70px + var(--app-safe-bottom))");
  expect(css).toContain("padding:8px 0 max(6px,var(--app-safe-bottom))");
  expect(css).toContain(".bottom-nav button.active:before{top:-8px}");
  expect(css).toContain(".schedule-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}");
  expect(css).toContain(".detail-actions { padding: 9px 10px; }");
  expect(css).toContain("bottom:calc(74px + var(--app-safe-bottom))");
});
