# Budget Planner

A mobile-first web app that answers a single question: "Given my income and my dated expenses, what is my balance on every day of the month, and does it ever drop below my safety floor?"

All financial calculations live in a pure deterministic simulation engine. The optional AI assistant performs zero calculations; it only turns typed text into draft items for review and explains engine output.

---

## Architecture

The project is structured as an npm workspaces monorepo:

- `packages/engine`: Pure, zero-dependency calculation engine shared by both client and server. Operates on integer minor units to eliminate floating-point errors.
- `apps/server`: Express backend with MongoDB persistence (Mongoose), session cookies, rate limiting, and an optional AI assistant adapter.
- `apps/web`: React with Vite mobile-first Progressive Web App (PWA). Imports `@budget/engine` directly so What-If exploration recomputes instantly in the browser without network requests.

---

## Prerequisites

- Node.js 18.0.0 or higher
- MongoDB instance running locally on `mongodb://127.0.0.1:27017` or accessible via a connection string

---

## Environment Variables

Create an `.env` file inside `apps/server/` or pass variables to your runtime environment:

```env
# Server port (default: 4000)
PORT=4000

# MongoDB connection string (default: mongodb://127.0.0.1:27017/budget_planner)
MONGODB_URI=mongodb://127.0.0.1:27017/budget_planner

# Session secret used to sign session cookies
SESSION_SECRET=your_secure_random_session_secret

# Optional: Google Gemini API key for assistant features (off by default)
GEMINI_API_KEY=your_gemini_api_key_here

# Runtime environment (development / production)
NODE_ENV=development
```

---

## Setup and Installation

1. Install all dependencies across the workspace:
   ```bash
   npm install
   ```

---

## Running Tests

Run the test suite across both engine and server:

```bash
# Run pure engine tests (includes the acceptance fixture)
npm run test:engine

# Run server API tests
npm run test --workspace=@budget/server
```

---

## Running the Application Locally

1. Start MongoDB:
   Make sure MongoDB is running on your system (e.g. `mongod` or the MongoDB Windows Service).

2. Start the backend API server:
   ```bash
   npm run dev:server
   ```
   The backend starts at `http://localhost:4000`.

3. Start the frontend development server:
   ```bash
   npm run dev:web
   ```
   The web app starts at `http://localhost:3000`.

---

## Key Features

1. **Item Types (Planned Expenses)**:
   - One-time: name, amount, scheduled date.
   - Recurring: name, amount, day of month (automatically clamped to month end on shorter months), with an optional `isFixed` flag to carry forward the exact amount on the same day to the next month during rollover.
   - Fuel Log: records fuel stops with odometer readings, liters, and cost; automatically calculates bike fuel efficiency (km/L) once 2 stops are logged.
2. **Actual Calendar Dates & Specific Salary Credit Date**:
   - Specific calendar date selector for salary credit (`incomeCreditDate`).
   - Seamlessly handles salary credited on preceding month-ends (e.g. Sept 30) for the current month's budget, crediting funds on Day 1 (Oct 1).
   - Dates displayed across the UI as readable dates (e.g. `Fri, Sep 18`) replacing raw day numbers.
   - Rupee (`₹`) is the default currency across the application.
3. **Today's Balance & Timeline**:
   - Summary cards prominently display your running balance as of today's date (`todayBalance`), with month-end projected balance in subtext.
4. **Optimized Goal Date Recommendation Pipeline**:
   - Evaluates dynamic daily spending pattern (burn rate) from logged actuals.
   - Restricts recommendation candidate dates strictly to today onwards (`d >= currentDay`).
   - Ensures heavy recurring bills due in the near future are cleared first before scheduling discretionary goal purchases.
   - Never displays an arbitrary date when a purchase is infeasible; explicitly reports the projected safety floor deficit with 1-tap "Defer to next month".
   - Focused Goals screen with clutter-free interface (global defaults removed).
5. **Net Item Amount on Mapped Refunds**:
   - When a refund/credit transaction is mapped to a planned item, the UI displays the net of the item (e.g. ₹319 original minus ₹300 refund displays ₹19 net) while accurately preserving cash timing in timeline simulations.
6. **Unplanned Expense Logging & Actuals Tracking**:
   - `transactions` collection with 3-tap quick-log (amount, optional tag from Food/Travel/Health/Other, optional note, date defaults to today).
   - Monthly unplanned allowance monitored as "Safe to spend per day" (`allowance left ÷ days left`).
   - Match logged entries to planned items to avoid double-counting.
   - Re-runs simulation with actuals and remaining planned items, updating timeline and floor alerts.
   - Supports refunds as negative amounts and backdated entries.
   - Month-end review: allowance vs actual spend by tag with suggested next-month allowance computed by plain arithmetic.
7. **Floor Check & Alert**:
   - Computes lowest balance and date of lowest balance.
   - Shows clear visual indicator if the safety floor is breached or safely maintained.
8. **SVG Balance Step-Line Chart**:
   - Step line across calendar dates with a dashed safety floor line and marker on the lowest point.
9. **What-If Exploration**:
   - In-browser slider/input adjustments that re-run the pure engine instantly without saving to the database.
10. **Month Rollover**:
   - Creates the next calendar month, copies fixed recurring items (`isFixed === true`), and optionally carries forward the ending balance as the opening balance.
11. **Optional AI Assistant (Off by default)**:
   - Off by default; no data leaves the server when disabled.
   - Converts natural language ("3 outings, 50 km each, 300 per ticket") into a draft item that must be reviewed and confirmed before saving.
   - Summarizes timeline and suggests remediation for safety floor breaches.
   - Strict output schema validation and rate-limiting.

---

## Non-Goals

- No automatic bank scraping or sync.
- No payment execution.
- No investment advice or speculative projections.
- No multi-user shared ledgers.
