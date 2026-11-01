# Strict Refund-to-Spent-Transaction Exclusivity

Refund transactions may only be mapped to an existing spent transaction (`refundTargetTransactionId`). Refunds can never be mapped to planned budget items.

Planned budget items belong strictly to future spending projections, while transactions represent recorded historical actuals. Linking a refund to a planned item breaches the boundary between simulation planning and ledger reality. Restricting refunds exclusively to spent transactions preserves this separation and keeps cashflow accounting deterministic.
