import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveSecret, resolveCorsOrigin, LEGACY_DEFAULT_JWT_SECRET } from '../src/config.js';

describe('resolveSecret', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-secret-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('uses JWT_SECRET (or SESSION_SECRET) when provided', () => {
    expect(resolveSecret({ JWT_SECRET: ' a'.padEnd(40, 'x') + ' ' }, { isProduction: true })).toBe('a'.padEnd(39, 'x'));
    expect(resolveSecret({ SESSION_SECRET: 's'.repeat(40) }, { isProduction: true })).toBe('s'.repeat(40));
  });

  it('refuses to start in production without a secret', () => {
    expect(() => resolveSecret({}, { isProduction: true })).toThrow(/must be set in production/);
  });

  it('refuses the old committed default in production', () => {
    expect(() => resolveSecret({ JWT_SECRET: LEGACY_DEFAULT_JWT_SECRET }, { isProduction: true }))
      .toThrow(/old public default/);
  });

  it('never returns the old committed default, even in development', () => {
    const file = path.join(tmpDir, 'secret');
    const s = resolveSecret({ JWT_SECRET: LEGACY_DEFAULT_JWT_SECRET }, { isProduction: false, devSecretFile: file });
    expect(s).not.toBe(LEGACY_DEFAULT_JWT_SECRET);
  });

  it('creates a random development secret once and reuses it across restarts', () => {
    const file = path.join(tmpDir, 'secret');
    const first = resolveSecret({}, { isProduction: false, devSecretFile: file });
    const second = resolveSecret({}, { isProduction: false, devSecretFile: file });
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
    expect(fs.readFileSync(file, 'utf8')).toBe(first);
  });

  it('falls back to a per-process random secret when no file can be written', () => {
    const s = resolveSecret({}, { isProduction: false, devSecretFile: null });
    expect(s).toHaveLength(64);
    expect(s).not.toBe(LEGACY_DEFAULT_JWT_SECRET);
  });
});

describe('resolveCorsOrigin', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('keeps a single origin or a comma-separated list', () => {
    expect(resolveCorsOrigin('https://app.example.com', { isProduction: true })).toBe('https://app.example.com');
    expect(resolveCorsOrigin('https://a.example.com, https://b.example.com', { isProduction: true }))
      .toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('defaults to the local web app', () => {
    expect(resolveCorsOrigin(undefined)).toBe('http://localhost:3000');
  });

  it('rejects a wildcard in production because requests carry login cookies', () => {
    expect(() => resolveCorsOrigin('*', { isProduction: true })).toThrow(/not allowed in production/);
    expect(() => resolveCorsOrigin('https://a.example.com,*', { isProduction: true })).toThrow();
  });

  it('narrows a wildcard to local origins in development', () => {
    const origins = resolveCorsOrigin('*', { isProduction: false });
    expect(Array.isArray(origins)).toBe(true);
    expect(origins).toContain('http://localhost:3000');
    expect(origins).not.toContain('*');
  });
});
