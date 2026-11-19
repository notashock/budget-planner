/**
 * How many Postgres connections one server process may hold, and for how long.
 *
 * Production connects through Supabase's session pooler, which gives every
 * client connection its own database connection and allows only 15 in all.
 * On Vercel each function instance has its own pool, and a deploy (plus
 * previews, plus several regions) runs many instances at once. With 4
 * connections each, held 30s when idle, a handful of instances used all 15 and
 * every query failed with EMAXCONNSESSION (2026-11-19).
 *
 * So a serverless instance keeps a single connection and lets it go after a few
 * idle seconds. Queries in one request queue on it instead of fanning out. Code
 * that holds a pool client must not also query through the pool while holding
 * it (it would wait on itself): use a separate client, as SalaryCycleJob does.
 *
 * @param {{ serverless: boolean, production: boolean }} env
 */
export function poolSizing({ serverless, production }) {
  if (serverless) {
    return {
      max: 1,
      idleTimeoutMillis: 5000,
      // Requests queue for the one connection, so allow a little longer to get it
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true
    };
  }
  return {
    max: production ? 10 : 4,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: false
  };
}
