# ADR 0055: Defensive Core, Unified Response Envelope, and Month Lifecycle Deepening

## Status
Accepted

## Context
Following the successful migration to PostgreSQL, the server codebase had two critical architectural pain points:
1. **Ad-hoc Response & Error Handling**: HTTP route handlers were each individually wrapping responses in ad-hoc JSON structures (`res.json(data)`, `res.status(400).json({ error: '...' })`), resulting in divergent response shapes, repetitive try/catch logic, and no standardized metadata or timestamps.
2. **Defensive Gaps**: Incoming requests had no centralized security barrier against prototype pollution (`__proto__`, `constructor`), cross-site scripting (XSS tags like `<script>` or event handlers), SQL injection probes, or path traversal patterns.
3. **Monolithic Route Orchestration**: `routes/months.js` had expanded to 1,037 lines, directly coupling HTTP parameter parsing with database transactions, per-account simulation iteration loops, salary credit transaction generation, and rollover item duplication.

## Decisions

### 1. Unified Response Envelope
All API endpoints dispatch through a standardized response envelope:
```json
{
  "status": "success",
  "timestamp": "2026-10-18T18:30:00.000Z",
  "metadata": {
    "path": "/api/months/2026/11",
    "method": "GET"
  },
  "data": { ... }
}
```
Error responses follow a structured error taxonomy:
```json
{
  "status": "error",
  "timestamp": "2026-10-18T18:30:00.000Z",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": null
  },
  "metadata": {
    "path": "/api/months/2026/11",
    "method": "POST"
  }
}
```

### 2. Transparent Client Unwrapping
To maintain 100% backward compatibility across all existing Web and Flutter components:
- `apps/web/src/api.js` unpacks `response.data` in its base `request()` helper when the standard envelope is present (`response.status === 'success' && response.data !== undefined`).
- `apps/mobile/lib/services/api_service.dart` unpacks `responseData['data']` in its base `_request()` method.
- Both clients extract `error.message || error` on failed responses.

### 3. Defensive Core Middleware
We introduce a deep `defense` middleware in `apps/server/src/middleware/defense.js`:
- **Hybrid Security Firewall**: Cleans null bytes and control characters, but strictly rejects (`HTTP 400 MALICIOUS_INPUT_DETECTED`) any payload containing prototype pollution keys (`__proto__`, `constructor`, `prototype`), `<script>` tags, or SQL/path-traversal probes.
- **Security Headers**: Standardizes secure headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-XSS-Protection: 0`, `Referrer-Policy: no-referrer`).
- **Strict Payload Limits**: Enforces a strict 100KB request body size cap to prevent resource exhaustion attacks.

### 4. Deep MonthLifecycle Domain Module
We extract all business calculation and persistence coordination from `routes/months.js` into `apps/server/src/domain/monthLifecycle.js`:
- Exposes a minimal, cohesive interface:
  - `getMonthDetails(userId, year, month)`
  - `createMonth(userId, monthData)`
  - `updateMonth(userId, year, month, updates)`
  - `creditSalary(userId, year, month, options)`
  - `rolloverMonth(userId, currentYear, currentMonth, options)`
  - `deleteMonth(userId, year, month, force)`
- `routes/months.js` becomes a thin controller (~80 lines), delegating all work to `MonthLifecycle`.

## Consequences
- **Locality**: Security rules, error shapes, and simulation loops are each concentrated in their respective single deep modules rather than scattered across 10 route files.
- **Leverage**: A single response decorator and error handler govern every endpoint.
- **Testability**: The `MonthLifecycle` domain module can be tested in isolation with deterministic unit and integration tests without spinning up Supertest HTTP servers.
