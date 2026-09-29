# Shared Deterministic Simulation Engine in Monorepo

The timeline simulation and floor breach calculation must run identically on the backend and in the browser for instant What-If projections without server round-trips. We decided to structure the codebase as a workspace monorepo where all calculation logic lives in an isolated, pure TypeScript package (`@budget/engine`) with zero I/O and zero date-clock dependencies, imported directly by both `@budget/server` and `@budget/web`.
