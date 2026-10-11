# ADR 0046: Ephemeral Random Fallback Secret Generation and Tamper Resistance

## Status
Accepted

## Context
1. **Public Secret Defaults**:
   - `apps/server/src/config.js` and `docker-compose.yml` previously provided a static fallback secret (`dev_session_secret_change_in_production`).
   - If an operator deploys the application without setting `JWT_SECRET` or `SESSION_SECRET`, an external attacker aware of the public repository code could forge authentication signatures.
2. **Operational Ergonomics vs. Strict Startup Failure**:
   - Strictly crashing on boot (`process.exit(1)`) if a secret is unset breaks zero-config deployments, preview containers, and quick local evaluations.
   - However, falling back to a static known string is insecure.

## Decision
1. **Dynamic Ephemeral Secret Generation**:
   - If `JWT_SECRET` (or `SESSION_SECRET`) is not provided in environment variables, or if it equals known development placeholder strings (e.g. `'dev_session_secret_change_in_production'`):
     - The server dynamically generates a cryptographically secure 256-bit random secret using Node's native `crypto.randomBytes(32).toString('hex')` at startup.
     - Logs a prominent security warning to `stdout`:
       `"[SECURITY WARNING] No persistent JWT_SECRET provided. Generated ephemeral 256-bit secret. User sessions will not survive process restarts unless JWT_SECRET is explicitly set in .env."`
2. **Elimination of Hardcoded Static Secret Strings**:
   - Remove `dev_session_secret_change_in_production` from `docker-compose.yml` and `config.js`.
   - Provide an empty default or comment in `.env.example` instructing operators to generate a persistent random secret for production stability.

## Consequences
- Completely eliminates token forgery vulnerabilities: attackers can never guess or predict the signing secret.
- Preserves zero-config launch capability for local development and ephemeral container test runs.
- Sessions/tokens are invalidated on server restart if a persistent secret is not provided in `.env`, incentivizing operators to provide a permanent secret for long-term production deployments.
