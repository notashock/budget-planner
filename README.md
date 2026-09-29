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

1. **Three Item Types**:
   - One-time: name, amount, date.
   - Recurring: name, amount, day of month (automatically clamped to month end on shorter months).
   - Formula: name, distance, efficiency, fuel price, extra cost per occurrence, list of dates. Cost per occurrence is rounded to a whole unit as specified.
2. **Floor Check & Alert**:
   - Computes lowest balance and date of lowest balance.
   - Shows clear visual indicator if the safety floor is breached or safely maintained.
3. **SVG Balance Step-Line Chart**:
   - Step line across calendar days with a dashed safety floor line and marker on the lowest point.
4. **What-If Exploration**:
   - In-browser slider/input adjustments that re-run the pure engine instantly without saving to the database.
5. **Month Rollover**:
   - Creates the next calendar month, copies recurring items, and optionally carries forward the ending balance as the opening balance.
6. **Optional AI Assistant (Off by default)**:
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
