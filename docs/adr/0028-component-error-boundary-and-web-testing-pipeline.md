# ADR 0028: Component Error Boundary and Web Unit Testing Verification Pipeline

## Status
Accepted

## Context
1. A runtime `ReferenceError` occurred in `StepLineChart.jsx` due to an undeclared touch event handler (`handleTouch`) and internal chart variables (`minDay`, `maxDay`) not being exposed from `useMemo`. When unhandled, such errors cause React to unmount the entire application tree, presenting a white screen to the user.
2. The monorepo previously executed unit tests for `@budget/engine` (15 tests) and `@budget/server` (21 tests), but did not have an automated unit testing suite configured for the frontend workspace (`@budget/web`).
3. Complex interactive components—including the SVG StepLineChart, the custom DatePicker popover, the SearchableItemPicker dropdown, and SummaryCards—required automated contract validation across touch gestures, upward opening directions, keyboard operations, and error states.

## Decision
1. **Component Error Boundary**:
   - Implemented `ErrorBoundary.jsx` as a reusable fault-isolation boundary adhering to the Swiss-Linear monochrome aesthetic.
   - Wrapped `<StepLineChart>` inside `PlanScreen.jsx` and the active screen route switcher in `App.jsx`, ensuring that unexpected widget failures never unmount the surrounding navigation or modal interfaces.
   - Provided an intuitive recovery UI with an error summary, a "Try again" reset button, and a "Reload page" action.
2. **Chart Touch & Scope Fixes**:
   - Implemented `handleTouch` in `StepLineChart.jsx` converting touch client coordinates into chart SVG space and selecting the closest chronological day node.
   - Exposed `minDay` and `maxDay` from `chartData = useMemo(...)` to prevent axis boundary reference errors.
3. **Web Testing Suite Configuration**:
   - Installed `vitest`, `jsdom`, and `@testing-library/react` into `@budget/web`.
   - Added `apps/web/src/test/setup.js` and Vitest jsdom configuration in `vite.config.js`.
   - Added `"test": "vitest run"` script to `apps/web/package.json`.
4. **Component Unit Tests**:
   - Created comprehensive test suites:
     - `ErrorBoundary.test.jsx`: Child rendering, error interception, recovery state reset.
     - `StepLineChart.test.jsx`: Empty state, SVG chart rendering, touch event scrubbing (`handleTouch`), point clicking, and day filter clearing.
     - `DatePicker.test.jsx`: Trigger button formatting, upward popover dialog, month/year navigation, keyboard Escape dismissal, and day selection.
     - `SearchableItemPicker.test.jsx`: Placeholder trigger, selected item badge & currency format, search query filtering, and unmapped/unexpected spending option.
     - `SummaryCards.test.jsx`: Safe velocity metric display, committed bill footer, and detailed KPI grid floor breach indicators.
5. **Workflow & Monorepo Integration**:
   - Updated root `package.json` with `"test:web"` and expanded `"test:all"` to run `engine`, `server`, and `web` tests sequentially.
   - Updated `.github/workflows/ci.yml` to include the `Run Web Component Unit Tests` step in CI verification before building and health checks.

## Consequences
- Single-component errors can no longer crash the entire application; users receive clean recovery options.
- All web interactive components are verified automatically on every commit, preventing regressions in touch scrubbing, date picking, and filtering.
- Monorepo CI and local developers run `npm run test:all` across all 3 workspaces (58 total tests: 15 engine, 21 server, 22 web) with 100% passing rate.
