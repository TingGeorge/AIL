const NAVIGATION_INDEX_KEY = "__allInLifeNavigationIndex";
export const APP_ROUTE_CHANGE_EVENT = "allinlife:routechange";

type HistoryState = Record<string, unknown>;

export type NavigationEnvironment = {
  history: Pick<History, "state" | "pushState" | "replaceState" | "back">;
  location: Pick<Location, "hash">;
  notify: () => void;
};

function browserEnvironment(): NavigationEnvironment {
  return {
    history: window.history,
    location: window.location,
    notify: () => window.dispatchEvent(new Event(APP_ROUTE_CHANGE_EVENT)),
  };
}

function stateObject(state: unknown): HistoryState {
  return state !== null && typeof state === "object" && !Array.isArray(state)
    ? state as HistoryState
    : {};
}

export function appNavigationIndex(state: unknown): number | null {
  const value = stateObject(state)[NAVIGATION_INDEX_KEY];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function stateAtIndex(state: unknown, index: number): HistoryState {
  return { ...stateObject(state), [NAVIGATION_INDEX_KEY]: index };
}

function routeHash(path: string): string {
  return `#${path.startsWith("/") ? path : `/${path}`}`;
}

export function initializeAppNavigation(environment = browserEnvironment()): void {
  if (appNavigationIndex(environment.history.state) !== null) return;
  environment.history.replaceState(stateAtIndex(environment.history.state, 0), "");
}

export function pushAppRoute(path: string, environment = browserEnvironment()): void {
  initializeAppNavigation(environment);
  const hash = routeHash(path);
  if (environment.location.hash === hash) return;
  const currentIndex = appNavigationIndex(environment.history.state) ?? 0;
  environment.history.pushState(stateAtIndex(environment.history.state, currentIndex + 1), "", hash);
  environment.notify();
}

export function replaceAppRoute(path: string, environment = browserEnvironment()): void {
  initializeAppNavigation(environment);
  const hash = routeHash(path);
  const currentIndex = appNavigationIndex(environment.history.state) ?? 0;
  environment.history.replaceState(stateAtIndex(environment.history.state, currentIndex), "", hash);
  environment.notify();
}

export function backAppRoute(fallbackPath: string, environment = browserEnvironment()): "history" | "fallback" {
  initializeAppNavigation(environment);
  if ((appNavigationIndex(environment.history.state) ?? 0) > 0) {
    environment.history.back();
    return "history";
  }
  replaceAppRoute(fallbackPath, environment);
  return "fallback";
}
