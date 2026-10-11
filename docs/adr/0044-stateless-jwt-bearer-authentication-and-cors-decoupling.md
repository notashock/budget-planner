# ADR 0044: Stateless JWT Bearer Authentication and CORS Decoupling

## Status
Accepted

## Context
1. **CORS Credential Reflection**:
   - The security audit identified that `apps/server/src/app.js` configured `cors({ origin: true, credentials: true })` whenever `CORS_ORIGIN=*`, dynamically reflecting caller `Origin` headers while allowing ambient session cookies (`connect.sid`).
   - Ambient cookies sent automatically by browsers create cross-origin read and CSRF vulnerabilities unless strictly partitioned.
2. **Authentication Evolution**:
   - The existing architecture utilized `express-session` and `connect-mongo`.
   - The mobile-first PWA architecture requires clean decoupling of API requests from ambient browser cookie state so the client can authenticate across diverse hostnames, dev servers, or mobile test devices without cross-origin cookie reflection risks.

## Decision
1. **Transition to Stateless JWTs**:
   - Replace cookie-based `express-session` with stateless JSON Web Tokens (JWT).
   - `POST /api/auth/login` and `POST /api/auth/register` return an object `{ user, token }`.
   - The token payload contains `{ userId, email, exp }` signed using HMAC-SHA256 with a dedicated `JWT_SECRET`.
   - Token expiration defaults to 14 days (`SESSION_MAX_AGE_DAYS`).
2. **Bearer Token Authentication Header**:
   - The web client stores the token in `localStorage` under `budget_auth_token` for persistent mobile PWA sessions.
   - All API requests dispatch an `Authorization: Bearer <token>` header via `apps/web/src/api.js`.
   - `apps/server/src/middleware/auth.js` (`requireAuth`) extracts the token from the `Authorization` header, verifies the signature using `JWT_SECRET`, and populates `req.session = { userId: decoded.userId }` (preserving downstream route compatibility) or attaches `req.userId`.
3. **Decoupling CORS from Ambient Credentials**:
   - Because ambient cookies are no longer used for API authorization, `credentials: true` is no longer required on the CORS middleware.
   - Without ambient credentials, cross-origin request headers require explicit token attachment by the client script; third-party sites cannot silently read user data simply by embedding links or scripts.
   - CORS origin can be safely configured to allow the Vite dev server and mobile clients without risk of ambient credential leakage.
4. **Logout Behavior**:
   - Client clears `budget_auth_token` from `localStorage` and resets in-memory client state.

## Consequences
- Eliminates ambient cookie CSRF and credentialed CORS origin reflection vulnerabilities entirely.
- Removes runtime dependency on `express-session` and MongoDB session store polling.
- Requires securing `JWT_SECRET` in environment variables with strict startup validation.
