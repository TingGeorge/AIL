'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';

const THEME_STORAGE_KEY = 'all-in-life-theme';

type Theme = 'light' | 'dark';

const subscribeToTheme = (onStoreChange: () => void) => {
  window.addEventListener('all-in-life-theme-change', onStoreChange);
  return () =>
    window.removeEventListener('all-in-life-theme-change', onStoreChange);
};

const getThemeSnapshot = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

const getServerThemeSnapshot = () => null;

function applyTheme(theme: Theme, persist = true) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  if (persist) {
    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The visual switch still works when storage is blocked by the browser.
    }
  }

  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) =>
      meta.setAttribute('content', theme === 'dark' ? '#090c0a' : '#f1efe6'),
    );

  window.dispatchEvent(
    new CustomEvent<Theme>('all-in-life-theme-change', { detail: theme }),
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore<Theme | null>(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') {
      return;
    }

    let initialTheme: Theme | null = null;
    try {
      const savedTheme = window.localStorage?.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        initialTheme = savedTheme;
      }
    } catch {
      // Fall back to the product default below.
    }
    applyTheme(initialTheme ?? 'dark', false);
  }, []);

  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme;
    applyTheme(current === 'light' ? 'dark' : 'light');
  };

  const label =
    theme === 'dark'
      ? '切換至亮色模式'
      : theme === 'light'
        ? '切換至暗色模式'
        : '切換亮暗模式';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-current-theme={theme ?? undefined}
    >
      <Sun className="theme-toggle-sun" aria-hidden="true" />
      <Moon className="theme-toggle-moon" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
