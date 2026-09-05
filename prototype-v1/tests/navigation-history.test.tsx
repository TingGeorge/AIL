import { expect, test } from "bun:test";

type Scenario = "list-history" | "results-detail" | "offers-detail";

const projectRoot = new URL("..", import.meta.url).pathname;
const appModulePath = new URL("../src/client/App.tsx", import.meta.url).pathname;

/**
 * App imports React at module evaluation time, so this harness runs in a child
 * Bun process. That keeps the JSX/runtime mocks and fake browser globals from
 * leaking into the other client tests that share Bun's test process.
 */
function navigationHarness(scenario: Scenario): string {
  return `
import { mock } from "bun:test";

const appModulePath = ${JSON.stringify(appModulePath)};
const scenario = ${JSON.stringify(scenario)};

type ElementNode = {
  type: unknown;
  props: Record<string, unknown>;
};

type HistoryEntry = {
  hash: string;
  state: unknown;
};

let entries: HistoryEntry[] = [];
let cursor = 0;

const testLocation = {
  get hash(): string {
    return entries[cursor]?.hash ?? "#/home";
  },
  set hash(value: string) {
    const hash = value.startsWith("#") ? value : "#" + value;
    entries = entries.slice(0, cursor + 1);
    entries.push({ hash, state: null });
    cursor = entries.length - 1;
  },
};

const testHistory = {
  get length(): number {
    return entries.length;
  },
  get state(): unknown {
    return entries[cursor]?.state ?? null;
  },
  pushState(state: unknown, _title: string, url?: string | URL | null): void {
    const hash = String(url ?? testLocation.hash);
    entries = entries.slice(0, cursor + 1);
    entries.push({ hash: hash.startsWith("#") ? hash : "#" + hash, state });
    cursor = entries.length - 1;
  },
  replaceState(state: unknown, _title: string, url?: string | URL | null): void {
    const hash = url === undefined || url === null ? testLocation.hash : String(url);
    entries[cursor] = { hash: hash.startsWith("#") ? hash : "#" + hash, state };
  },
  back(): void {
    if (cursor > 0) cursor -= 1;
  },
};

const testWindow = {
  history: testHistory,
  location: testLocation,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
};

const memoryStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
  clear: () => {},
  key: (_index: number) => null,
  length: 0,
};

Object.defineProperties(globalThis, {
  location: { configurable: true, value: testLocation },
  history: { configurable: true, value: testHistory },
  navigator: { configurable: true, value: { onLine: true } },
  sessionStorage: { configurable: true, value: memoryStorage },
  window: { configurable: true, value: testWindow },
});

const noop = () => {};
const Icon = () => null;

mock.module("react", () => ({
  useState<T>(initial: T | (() => T)) {
    const value = typeof initial === "function" ? (initial as () => T)() : initial;
    return [value, noop] as const;
  },
  useEffect: noop,
  useMemo<T>(factory: () => T) { return factory(); },
  useRef<T>(initial: T) { return { current: initial }; },
}));

mock.module("react/jsx-runtime", () => ({
  Fragment: Symbol.for("react.fragment"),
  jsx(type: unknown, props: Record<string, unknown> | null) {
    return { type, props: props ?? {} };
  },
  jsxs(type: unknown, props: Record<string, unknown> | null) {
    return { type, props: props ?? {} };
  },
}));

mock.module("lucide-react", () => ({
  ArrowLeft: Icon, ArrowRight: Icon, Bookmark: Icon, Check: Icon,
  CircleDollarSign: Icon, Compass: Icon, Gift: Icon, Heart: Icon,
  Home: Icon, Info: Icon, LogIn: Icon, MapPin: Icon, Mic: Icon,
  Pencil: Icon, Radar: Icon, Search: Icon, Settings: Icon,
  SlidersHorizontal: Icon, Sparkles: Icon, Square: Icon,
  TicketPercent: Icon, UserRound: Icon, WalletCards: Icon, X: Icon,
  ChevronDown: Icon, ChevronUp: Icon, LogOut: Icon, Users: Icon,
  Library: Icon, Flag: Icon, Save: Icon, ShieldCheck: Icon,
  BusFront: Icon, CalendarDays: Icon, CheckCircle2: Icon,
  ChevronRight: Icon, Clock3: Icon, Copy: Icon, ExternalLink: Icon,
  HandHeart: Icon, Package: Icon, PartyPopper: Icon, ReceiptText: Icon,
  Share2: Icon, ShoppingBag: Icon, Tag: Icon,
}));

const { App } = await import(appModulePath);

type AppTree = ElementNode;

function resetHistory() {
  entries = [{ hash: "#/home", state: null }];
  cursor = 0;
}

function asElement(value: unknown): ElementNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<ElementNode>;
  return node.props && typeof node.props === "object" ? node as ElementNode : null;
}

function childrenOf(node: ElementNode): unknown[] {
  const children = node.props.children;
  return Array.isArray(children) ? children : [children];
}

function walk(node: unknown, visit: (element: ElementNode) => boolean): ElementNode | null {
  const element = asElement(node);
  if (!element) return null;
  if (visit(element)) return element;
  for (const child of childrenOf(element)) {
    const match = walk(child, visit);
    if (match) return match;
  }
  return null;
}

function renderApp(): AppTree {
  return App() as unknown as AppTree;
}

function headerBackButton(tree: AppTree): ElementNode {
  const header = walk(tree, node => node.type === "header");
  const button = header && childrenOf(header)[0];
  const element = asElement(button);
  if (!element || element.type !== "button") throw new Error("頁首返回按鈕不存在");
  return element;
}

function bottomNavButton(tree: AppTree, label: string): ElementNode {
  const nav = walk(tree, node => node.type === "nav");
  const button = nav && childrenOf(nav)
    .map(asElement)
    .find(element => element?.type === "button" && childrenOf(element).includes(label));
  if (!button) throw new Error("找不到底部導覽：" + label);
  return button;
}

function componentWithName(tree: AppTree, name: string): ElementNode {
  const component = walk(tree, node =>
    typeof node.type === "function" && (node.type as { name?: string }).name === name,
  );
  if (!component) throw new Error("找不到元件：" + name);
  return component;
}

function invoke(node: ElementNode, prop: string, ...args: unknown[]) {
  const callback = node.props[prop];
  if (typeof callback !== "function") throw new Error("元件缺少 callback：" + prop);
  return callback(...args);
}

function clickBottomNav(label: string) {
  invoke(bottomNavButton(renderApp(), label), "onClick");
}

function clickHeaderBack() {
  invoke(headerBackButton(renderApp()), "onClick");
}

function assertHash(expected: string, step: string) {
  if (testLocation.hash !== expected) {
    throw new Error(step + ": 預期 " + expected + "，實際得到 " + testLocation.hash);
  }
}

const record = { id: "test-record" };

resetHistory();

if (scenario === "list-history") {
  clickBottomNav("結果");
  clickBottomNav("清單");
  clickBottomNav("優惠");
  assertHash("#/offers", "前往優惠");

  clickHeaderBack();
  assertHash("#/saved", "優惠返回");

  clickHeaderBack();
  assertHash("#/results", "清單返回");

  clickHeaderBack();
  assertHash("#/home", "結果返回");
} else if (scenario === "results-detail") {
  clickBottomNav("結果");
  const results = componentWithName(renderApp(), "BrowseResults");
  invoke(results, "onOpen", "test-record");
  assertHash("#/detail/test-record", "從結果開啟 detail");

  clickHeaderBack();
  assertHash("#/results", "結果 detail 返回");
} else if (scenario === "offers-detail") {
  clickBottomNav("優惠");
  const offers = componentWithName(renderApp(), "GroupOffers");
  invoke(offers, "onOpen", record);
  assertHash("#/detail/test-record", "從優惠開啟 detail");

  clickHeaderBack();
  assertHash("#/offers", "優惠 detail 返回");
} else {
  throw new Error("未知 navigation scenario：" + scenario);
}
`;
}

function runNavigationScenario(scenario: Scenario): void {
  const result = Bun.spawnSync([process.execPath, "-e", navigationHarness(scenario)], {
    cwd: projectRoot,
  });
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  if (result.exitCode !== 0) {
    throw new Error([
      `navigation harness failed for ${scenario}`,
      stderr || stdout || `exit code ${result.exitCode}`,
    ].join("\n"));
  }
}

test("頁首返回會沿 results → saved → offers 的 app 導覽歷史逐層返回", () => {
  runNavigationScenario("list-history");
});

test("從結果開啟 detail 後，頁首返回會回到結果而不是 home", () => {
  runNavigationScenario("results-detail");
});

test("從優惠開啟 detail 後，頁首返回會回到優惠來源頁", () => {
  runNavigationScenario("offers-detail");
});
