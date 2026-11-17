import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeMode } from '../hooks/useThemeMode.js';

describe('useThemeMode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('cycles system -> light -> dark -> system, applies data-theme and remembers the choice', () => {
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.themeMode).toBe('system');

    act(() => result.current.cycleTheme());
    expect(result.current.themeMode).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('budget_theme')).toBe('light');

    act(() => result.current.cycleTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.cycleTheme());
    expect(result.current.themeMode).toBe('system');
  });

  it('starts from the saved preference', () => {
    localStorage.setItem('budget_theme', 'dark');
    const { result } = renderHook(() => useThemeMode());
    expect(result.current.themeMode).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
