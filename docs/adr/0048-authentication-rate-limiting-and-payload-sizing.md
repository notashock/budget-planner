# ADR 0048: Authentication Rate Limiting and Month Opening Balances Sizing Bounds

## Status
Accepted

## Context
1. **Unthrottled Authentication Endpoints**:
   - The security audit highlighted that `/api/auth/login` and `/api/auth/register` did not enforce rate limits.
   - Because `bcrypt.compare` requires significant CPU computation per attempt, unthrottled endpoints allow attackers to execute automated password guessing or consume CPU resources with registration floods.
2. **Unbounded Subdocument Arrays in Month Openings**:
   - `accountOpeningBalances` represents the per-account cash breakdown on Day 1 of a single month document.
   - `POST /api/months` and `PUT /api/months/:year/:month` accepted arbitrarily sized arrays in `accountOpeningBalances`, risking MongoDB document bloat and server memory exhaustion.

## Decision
1. **Aggressive Authentication Rate Limiting**:
   - In `apps/server/src/routes/auth.js`:
     - Mount `express-rate-limit` on `POST /api/auth/login` configured for **5 attempts per 15 minutes** per IP.
     - Mount `express-rate-limit` on `POST /api/auth/register` configured for **2 registrations per hour** per IP.
     - Returns `HTTP 429 Too Many Requests` with `{ error: 'Too many requests. Please try again later.' }` when thresholds are exceeded.
2. **Strict Sizing Boundary for Per-Month Account Openings**:
   - In `apps/server/src/routes/months.js`:
     - Cap the `accountOpeningBalances` array to a maximum of **10 accounts** per month document.
     - Reject payloads exceeding 10 accounts with `HTTP 400 Bad Request` (`{ error: 'accountOpeningBalances cannot exceed 10 accounts per month' }`).
     - In addition, per ADR 0045, ensure each account in the array corresponds strictly to an active bank account or wallet owned by the user.

## Consequences
- Protects the login pipeline against automated credential stuffing and dictionary attacks.
- Prevents resource exhaustion and database document bloat on month creation/updates.
- 10 accounts per month provides generous headroom for typical personal finances while strictly guarding system capacity.
