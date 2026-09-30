# 7. Visual Priority Tiers, Input Spinner Removal, and Goal Lifecycle Alignment

Date: 2026-09-30

## Status

Accepted

## Context

In Sprint 5, four user-experience and workflow improvements were identified:
1. Purchase goals previously remained stuck displaying an "evaluating" badge because the persistence layer initialized goal documents with `status: 'evaluating'` (and set `'ready'` on promotion), while the user interface looked for `status === 'active'` to render dynamic date recommendations and buffer calculations, resulting in a hidden recommendation card.
2. Item priority was previously exposed as an arbitrary numeric integer (`0 = high`), creating cognitive friction when creating and reviewing budget items.
3. Native HTML numeric input fields (`<input type="number">`) presented browser stepper arrows (spinners) that caused accidental value increments or decrements during trackpad gestures, touch scrolling, and clicking.
4. The application header lacked an explicit "BETA" indicator to signal early access status to users.

## Decisions

1. **Goal Lifecycle State Machine Alignment**:
   - Canonical goal statuses are formalized as `active`, `scheduled`, and `deferred`.
   - New goals are created with `status: 'active'`.
   - The recommendation engine evaluates the goal synchronously on creation and on every timeline fetch, immediately exposing the recommended date, savings buffer, or safety floor deficit.
   - When 1-tap conversion is triggered, the goal moves to `status: 'scheduled'`. When deferred, it transitions to `status: 'deferred'`.
   - Legacy documents with `evaluating` or `ready` are transparently normalized to `active` and `scheduled`.

2. **3-Tier Visual Priority Bars**:
   - Rather than raw numbers or 5-star ratings, priority is standardized into a 3-tier visual bar indicator:
     - **High Priority** (Value `0`, 3 solid accent bars): Essential non-negotiables (rent, EMIs, utilities) that draw from daily cash before other expenses.
     - **Medium Priority** (Value `1`, 2 bars): Standard regular expenses.
     - **Low Priority** (Value `2`, 1 bar): Discretionary or flexible expenses processed last.
   - The underlying numeric sorting in `@budget/engine` remains deterministic and untouched.

3. **Global Input Spinner Removal**:
   - Native number inputs (`<input type="number">`) are retained to preserve mobile numeric soft keyboards, validation, and step formatting.
   - Spin buttons are completely stripped across WebKit (Chrome, Safari, Edge) and Firefox using global CSS rules (`-webkit-appearance: none`, `-moz-appearance: textfield`).

4. **Header Beta Badge**:
   - A subtle, sleek `<span className="beta-badge">BETA</span>` pill is integrated directly adjacent to the `Budget planner` logo in `Header.jsx`.

## Consequences

- Goals immediately show their date recommendations and safety buffers upon creation without being trapped in an "evaluating" display.
- Users can clearly see and select priority through intuitive bars without guessing what integer values mean.
- Accidental mouse-wheel and click adjustments on numbers are eliminated.
- Preserves full deterministic backward compatibility with existing data models.
