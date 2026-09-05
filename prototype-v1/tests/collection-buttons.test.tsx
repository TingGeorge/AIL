import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultsView, DetailView } from "../src/client/ResultsView.tsx";
import { BrowseResultsContent } from "../src/client/BrowseResults.tsx";
import { rowToRec } from "../src/shared/records.ts";

const item = rowToRec({ id: "collection-record", title: "清單分流測試", category: "食品",
  data_status: "已驗證", price_total_twd: 50, mandatory_fees_twd: 0, discount_twd: 0,
  agent: "paid", verified_at: "2026-09-05T00:00:00Z" });
const actions = (listed: boolean, bookmarked: boolean) => ({
  list: listed ? [item.id] : [], favs: bookmarked ? [item.id] : [],
  onList: () => {}, onFavorite: () => {}, onOpen: () => {}, onAdjust: () => {},
});
const heartButton = (html: string) => html.match(/<button\b[^>]*class="save-fab[^\"]*"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";

test("results and browse heart state follows list, never bookmarks (all four combinations)", () => {
  for (const listed of [false, true]) for (const bookmarked of [false, true]) {
    const props = actions(listed, bookmarked);
    const result = { main: [item], pending: [], excluded: [] };
    for (const html of [
      renderToStaticMarkup(<ResultsView {...props} records={[item]} pending={[]} excluded={[]} survival={false} />),
      renderToStaticMarkup(<BrowseResultsContent {...props} state={{ status: "ready", result }} onRetry={() => {}} />),
    ]) {
      const button = heartButton(html);
      expect(button).toContain(`aria-pressed="${listed}"`);
      expect(button).toContain(`aria-label="${listed ? "從清單移除" : "加入清單"} ${item.title}"`);
      expect(button).toContain("lucide-heart");
    }
  }
});

test("pending and excluded card hearts also follow the list", () => {
  const props = actions(true, false);
  const html = renderToStaticMarkup(<ResultsView {...props} records={[]} pending={[item]} excluded={[{ ...item, id: "excluded" }]} survival={false} />);
  expect(heartButton(html)).toContain('aria-pressed="true"');
  expect(html).toContain('aria-label="加入清單 清單分流測試"');
});

test("detail bookmark and heart remain independently selected", () => {
  for (const listed of [false, true]) for (const favorite of [false, true]) {
    const html = renderToStaticMarkup(<DetailView item={item} listed={listed} favorite={favorite} onFavorite={() => {}} onList={() => {}} onReport={() => {}} />);
    const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
    expect(buttons.find(button => button.includes("lucide-bookmark"))).toContain(`aria-pressed="${favorite}"`);
    expect(buttons.find(button => button.includes("lucide-heart"))).toContain(`aria-pressed="${listed}"`);
  }
});

test("selected heart styling cannot paint the button background red", async () => {
  for (const file of ["mvp.css", "results-view.css", "integration.css"]) {
    const css = await Bun.file(new URL(`../src/client/${file}`, import.meta.url)).text();
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const [, selector, body] of rules) {
      if (/\.save-fab[^{}]*(?:\.saved|\[aria-pressed)/.test(selector!) && !/svg|path/.test(selector!)) {
        expect(body).not.toMatch(/background(?:-color)?\s*:\s*var\(--coral\)/);
      }
    }
  }
});
