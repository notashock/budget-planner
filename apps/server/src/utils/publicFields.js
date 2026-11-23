// Fields removed from every API response, at any depth. Applied once in the response envelope, so
// domain code can keep working with full rows. test/public_contract.test.js pins the key set of each
// core resource, so a new database column fails CI until it is added to a response on purpose.
const NEVER_SENT = new Set([
  // Internal to the server
  'userId', 'passwordHash', 'createdAt', 'updatedAt',
  // No client reads these
  'heldByDay', 'itemNetMap', 'originalDate', 'username',
  // Simulation duplicates: accountSimulations[id].dailyBalances holds the per-account curves,
  // simulation.accounts holds the summaries, and the chart takes a day's events from simulation.events
  'accountDailyBalances', 'accountSummaries', 'intradayEvents'
]);

export function toPublic(data) {
  if (Array.isArray(data)) return data.map(toPublic);
  if (data === null || typeof data !== 'object') return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (!NEVER_SENT.has(k)) out[k] = toPublic(v);
  }
  return out;
}
