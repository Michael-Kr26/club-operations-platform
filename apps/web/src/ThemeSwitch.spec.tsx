import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';
import { readTheme, themeStorageKey } from './theme';
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('onthoudt de expliciete keuze en herstelt die bij opnieuw openen', () => {
  localStorage.setItem(themeStorageKey, 'light');
  const { unmount } = render(<ThemeSwitch />);
  fireEvent.click(screen.getByRole('button', { name: 'Donkere stijl' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  expect(localStorage.getItem(themeStorageKey)).toBe('dark');
  unmount();
  render(<ThemeSwitch />);
  expect(screen.getByRole('button', { name: 'Donkere stijl' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Donkere stijl' }));
  expect(localStorage.getItem(themeStorageKey)).toBe('light');
});
it('gebruikt zonder opgeslagen keuze de systeemstijl en laat een opgeslagen keuze voorgaan', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  expect(readTheme()).toBe('dark');
  localStorage.setItem(themeStorageKey, 'light');
  expect(readTheme()).toBe('light');
});
it('blijft schakelbaar wanneer de browser opslag weigert', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(<ThemeSwitch />);
  const previous = document.documentElement.dataset.theme;
  fireEvent.click(screen.getByRole('button', { name: 'Donkere stijl' }));
  expect(document.documentElement.dataset.theme).not.toBe(previous);
});
