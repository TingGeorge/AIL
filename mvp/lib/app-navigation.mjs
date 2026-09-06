export const appViewNames = Object.freeze([
  'welcome',
  'account',
  'onboarding',
  'home',
  'ready',
  'search',
  'results',
  'detail',
  'saved',
  'team',
  'settings',
  'profile',
  'filters',
  'notifications',
  'analytics',
  'history',
  'report',
  'map',
]);

const appViewSet = new Set(appViewNames);
const safeResultId = /^[A-Za-z0-9_:-]{1,160}$/;

/**
 * @param {string} hash
 * @returns {{ view: string, selectedId: string | null } | null}
 */
export function parseAppHash(hash) {
  if (typeof hash !== 'string') return null;
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (path.length === 0) return { view: 'welcome', selectedId: null };
  const view = path[0];
  if (!appViewSet.has(view)) return null;
  if (view !== 'detail') return { view, selectedId: null };
  if (path.length !== 2) return null;
  let selectedId;
  try {
    selectedId = decodeURIComponent(path[1]);
  } catch {
    return null;
  }
  if (!safeResultId.test(selectedId)) return null;
  return { view, selectedId };
}

/**
 * @param {string} view
 * @param {string | null} [selectedId]
 */
export function appHashForRoute(view, selectedId = null) {
  if (!appViewSet.has(view)) return '#/welcome';
  if (view === 'detail') {
    return typeof selectedId === 'string' && safeResultId.test(selectedId)
      ? `#/detail/${encodeURIComponent(selectedId)}`
      : '#/results';
  }
  return `#/${view}`;
}
