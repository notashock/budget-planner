# 0068: Retire MongoDB and the Server-Side Session Store

## Context
PostgreSQL (Drizzle) has been the only store the API reads and writes since ADR 0054. MongoDB lingered as a startup fallback, a session store (`connect-mongo`), an automatic one-off import on an empty database, Mongoose models under `src/archive`, and Mongo services in CI and Docker Compose. Ten server test files still imported Mongoose models that had already been moved, so they could not run.

Authentication also changed in the audit fixes: the web app now sends the signed token in the httpOnly `bp_auth` cookie and the mobile app sends it as a Bearer header. `express-session` only copied the same user id into a second cookie. On Vercel its in-memory store did not survive between invocations, so it never acted as a real session.

## Decision
1. Remove MongoDB entirely: `mongoose`, `connect-mongo`, `src/db.js`, `src/archive/`, the Mongo import and verify scripts, the automatic import on an empty database, the Mongo-only tests, and the Mongo services in CI and Docker Compose. The last commit that still contains this code is tagged `pre-mongo-removal`.
2. Remove `express-session`. Authentication is stateless: `middleware/auth.js` accepts the Bearer header or the `bp_auth` cookie and nothing else. Logout clears `bp_auth` and the old `connect.sid` cookie.
3. Remove the duplicate `/api/accounts` mount of the bank-accounts router. Accounts are served at `/api/bank-accounts` and `/api/v1/accounts`.

## Consequences
- One persistence technology and 28 fewer installed packages.
- Docker Compose now runs PostgreSQL and requires `JWT_SECRET`.
- Logging out cannot revoke a token that was copied elsewhere before it expires (`SESSION_MAX_AGE_DAYS`, default 14). This was already true, since the session store never held the authority.
- Importing data from an old MongoDB deployment needs the scripts at tag `pre-mongo-removal`.
