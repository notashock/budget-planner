import { useState, useEffect } from 'react';

/**
 * Theme preference: 'system' | 'light' | 'dark', remembered in localStorage.
 * Applies the resolved theme as data-theme on <html> and follows the OS
 * setting live while on 'system'. cycleTheme steps system -> light -> dark.
 */
export function useThemeMode() {
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('budget_theme') || 'system');

  useEffect(() => {
    localStorage.setItem('budget_theme', themeMode);

    const applyResolvedTheme = () => {
      let resolved = themeMode;
      if (themeMode === 'system') {
        const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = isDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
    };

    applyResolvedTheme();

    if (themeMode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyResolvedTheme();
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(listener);
        return () => mediaQuery.removeListener(listener);
      }
    }
  }, [themeMode]);

  const cycleTheme = () => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  return { themeMode, setThemeMode, cycleTheme };
}
