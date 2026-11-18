import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Clean up DOM after each test
afterEach(() => {
  cleanup();
  // Remembered entry defaults (utils/entryMemory.js) must not leak between tests
  try {
    window.localStorage.clear();
  } catch {
    // no storage in this environment
  }
});
