import { describe, it, expect, vi } from 'vitest';
import { defenseFirewall } from '../src/middleware/defense.js';

function run(body) {
  const req = { params: {}, query: {}, body: JSON.parse(JSON.stringify(body)) };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  const next = vi.fn();
  defenseFirewall(req, res, next);
  return { req, headers, err: next.mock.calls[0]?.[0] };
}

describe('defense middleware', () => {
  it('accepts ordinary notes that the old pattern rules rejected', () => {
    const notes = [
      'Scanned copies in ../receipts',
      'Split 1=1 with Priya',
      'Data: text/html invoice export',
      'Paid via javascript: workshop fee',
      "Dinner at O'Reilly or 1=1 cafe"
    ];
    for (const note of notes) {
      const { req, err } = run({ name: 'Expense', note });
      expect(err).toBeUndefined();
      expect(req.body.note).toBe(note);
    }
  });

  it('still strips null bytes', () => {
    const { req, err } = run({ note: 'a\u0000b' });
    expect(err).toBeUndefined();
    expect(req.body.note).toBe('ab');
  });

  it('still rejects prototype-pollution keys', () => {
    const body = JSON.parse('{"__proto__": {"isAdmin": true}}');
    const { err } = run(body);
    expect(err).toBeDefined();
    expect(err.message).toMatch(/prototype pollution/);
  });

  it('keeps the security headers', () => {
    const { headers } = run({});
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });
});
