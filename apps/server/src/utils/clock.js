import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The user's wall clock. The server runs in UTC, so between midnight and
 * 05:30 in India its "today" was still yesterday. Apps send their UTC offset
 * in minutes (X-Timezone-Offset, e.g. 330 for India) on every request, and
 * date logic reads "now" through localNow().
 */
const store = new AsyncLocalStorage();

/** Offsets in use around the world run from UTC−12:00 to UTC+14:00. */
export function parseOffset(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= -720 && n <= 840 ? n : null;
}

/** Runs the rest of the request with the user's UTC offset, when the app sent one. */
export function clockContext(req, res, next) {
  const offset = parseOffset(req.get('x-timezone-offset'));
  if (offset === null) return next();
  return store.run({ offset }, next);
}

/**
 * Now, shifted so that its local getters (getFullYear, getMonth, getDate)
 * read the user's date and time. Without an offset it is plain new Date().
 * shortcut: the instant itself is shifted, so use it for calendar dates only,
 * never to store a timestamp.
 */
export function localNow() {
  const now = new Date();
  const offset = store.getStore()?.offset;
  if (offset == null) return now;
  const serverOffset = -now.getTimezoneOffset();
  return new Date(now.getTime() + (offset - serverOffset) * 60_000);
}
