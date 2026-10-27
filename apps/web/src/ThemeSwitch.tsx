import { useEffect, useState } from 'react';
import { applyTheme, readTheme, themeStorageKey, type Theme } from './theme';
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null)
        setTheme(readTheme());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return (
    <button
      className="theme-switch"
      type="button"
      aria-label="Donkere stijl"
      aria-pressed={theme === 'dark'}
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
        try {
          localStorage.setItem(themeStorageKey, next);
        } catch {
          /* Keep the current choice in memory. */
        }
      }}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
      <span>{theme === 'dark' ? 'Donker' : 'Licht'}</span>
    </button>
  );
}
