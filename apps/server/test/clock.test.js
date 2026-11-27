import { describe, it, expect, vi, afterEach } from 'vitest';
import { clockContext, localNow, parseOffset } from '../src/utils/clock.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const withOffset = (header, fn) => new Promise((resolve) => {
  clockContext({ get: () => header }, {}, () => resolve(fn()));
});

describe('the user clock (X-Timezone-Offset)', () => {
  afterEach(() => vi.useRealTimers());

  it('reads India\'s date just after its midnight, while UTC is still on yesterday', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-27T19:00:00Z') }); // 00:30 on the 28th in India
    expect(await withOffset('330', () => iso(localNow()))).toBe('2026-11-28');
    expect(await withOffset('-300', () => iso(localNow()))).toBe('2026-11-27'); // 14:00 in New York
  });

  it('falls back to the server clock without a valid offset', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-27T19:00:00Z') });
    const server = iso(new Date());
    expect(await withOffset(undefined, () => iso(localNow()))).toBe(server);
    expect(await withOffset('9999', () => iso(localNow()))).toBe(server);
    expect(parseOffset('5.5')).toBeNull();
    expect(parseOffset('-720')).toBe(-720);
  });
});
