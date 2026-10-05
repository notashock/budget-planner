# Unified Aggregate Simulation with Per-Account Attribution

To ensure multiple bank accounts and wallets work seamlessly with all existing features (running balance timeline, safety floor breaches, safe velocity daily spend, and goal estimations), we decided that the primary simulation engine calculates a unified aggregate timeline across all funds, while supporting per-source attribution on items and transactions. This avoids splintering the user's monthly budget into disconnected silos while still providing individual account/wallet running balances, reconciliation, and source breakdowns.
