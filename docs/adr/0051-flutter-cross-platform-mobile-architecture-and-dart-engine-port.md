# ADR 0051: Flutter Cross-Platform Mobile Architecture and Dart Engine Port

## Status
Accepted

## Context
1. **Mobile Platform Requirement**:
   - The user requires an exact, native-performing cross-platform mobile replica of the Budget Planner application to test and run on a physical Android device.
   - The system requires seamless interaction with the existing Node.js/Express backend (`apps/server`) and MongoDB database.
2. **Local Development on Physical Hardware**:
   - Physical Android devices communicating over USB cannot reach `localhost:4000` directly without port forwarding. Using `adb reverse tcp:4000 tcp:4000` maps device localhost directly to the host machine's port, with configurable fallback host IP support for local Wi-Fi testing.
3. **Engine Parity & Zero-Latency Projections**:
   - The web client (`apps/web`) imports the pure mathematical calculation engine (`@budget/engine`) directly to evaluate What-If projections, timeline simulations, safe velocity calculations, and goal date recommendations at 60fps without server round-trips.
   - Replicating this experience in Flutter requires deterministic local calculation parity in Dart, rather than incurring network latency on every toggle or date change.

## Decision
1. **Monorepo Structure**:
   - Create the Flutter application inside `apps/mobile` within the existing repository monorepo alongside `apps/server` and `apps/web`.
2. **Dart Calculation Engine Port**:
   - Implement `apps/mobile/lib/engine/` as a pure, zero-I/O Dart port of `@budget/engine` (including `simulate()`, `evaluateGoalsWithReservation()`, `recommendPurchaseDate()`, `getSalaryWindowStatus()`, and currency/date formatters) ensuring 1:1 mathematical parity with the JavaScript implementation.
3. **State Management**:
   - Use `Provider` / `ChangeNotifier` (`AppState`, `ThemeNotifier`, `AuthNotifier`) for structured, clean, and reactive state management across screens.
4. **Networking & Authentication**:
   - Use `http` client configured with `Authorization: Bearer <token>` matching ADR 0044.
   - Default API base URL configured to `http://127.0.0.1:4000/api` for seamless `adb reverse` debugging, with an in-app settings sheet allowing custom server IP overrides.
   - Secure token persistence using `shared_preferences`.
5. **Swiss Minimalist Design Token Replication**:
   - Port the monochromatic design system (ADR 0022) with full support for Dark, Light, and System themes, Inter and JetBrains Mono typographic scales, and high-contrast border/surface hierarchies.
6. **Feature Scope**:
   - 1:1 replication of all 5 primary views: Plan (Dashboard/Timeline/StepLineChart/Safe Velocity), Items, Goals, Accounts, and Assistant, plus Unified Entry and month administration modals.

## Consequences
- Guarantees instant 60fps timeline and goal calculations on mobile hardware identical to the web app.
- Keeps backend and mobile code co-located and synchronized within a single monorepo.
- Requires maintaining Dart engine logic in sync with `@budget/engine` for future business logic additions.
