// A month's account openings are saved when the month is set up. Changing an entry in an
// earlier month afterwards left every later month starting from the old figure, so balances
// and safe-to-spend were off by the change. This trigger carries each change forward: it
// shifts the saved openings (and the month's total opening) of every later month by the
// change in that entry's effect on each account it touches.
//
// The effect of a row on an account mirrors recompute_account_balance (the balance trigger).
export const OPENING_CARRY_TRIGGER = 'trg_transactions_carry_openings';

export const openingCarrySql = `
  CREATE OR REPLACE FUNCTION transaction_effect_on(t "transactions", target uuid) RETURNS bigint AS $fn$
    SELECT CASE
      WHEN target IS NULL OR t."status" <> 'successful' THEN 0
      WHEN t."account_id" IS DISTINCT FROM target AND t."destination_account_id" IS DISTINCT FROM target THEN 0
      WHEN t."origin" IN ('held_in', 'lent_repaid') THEN ABS(t."amount")
      WHEN t."origin" IN ('held_return', 'lent_out') THEN -ABS(t."amount")
      WHEN t."is_income" = true THEN t."amount"
      WHEN t."origin" = 'transfer' AND t."destination_account_id" = target THEN t."amount"
      WHEN t."origin" = 'transfer' AND t."account_id" = target THEN -t."amount"
      ELSE -t."amount"
    END;
  $fn$ LANGUAGE sql IMMUTABLE;

  CREATE OR REPLACE FUNCTION shift_later_openings(t "transactions", target uuid, sign integer) RETURNS void AS $fn$
  DECLARE
    delta bigint := sign * transaction_effect_on(t, target);
    from_key integer;
    is_cash boolean;
  BEGIN
    IF delta = 0 THEN
      RETURN;
    END IF;
    -- The entry belongs to its month (even when dated a few days earlier); months are compared
    -- by year and month, since start_date isn't always stored
    SELECT COALESCE(
      (SELECT m."year" * 12 + m."month" FROM "months" m WHERE m."id" = t."month_id"),
      substr(t."date", 1, 4)::integer * 12 + substr(t."date", 6, 2)::integer
    ) INTO from_key;
    SELECT a."type" IN ('bank', 'wallet') INTO is_cash FROM "accounts" a WHERE a."id" = target;

    IF COALESCE(is_cash, false) THEN
      UPDATE "months" m SET "opening_balance" = m."opening_balance" + delta
      WHERE m."user_id" = t."user_id" AND m."year" * 12 + m."month" > from_key
        AND EXISTS (SELECT 1 FROM "month_account_openings" o WHERE o."month_id" = m."id" AND o."account_id" = target);
    END IF;

    UPDATE "month_account_openings" o SET "amount" = o."amount" + delta
    FROM "months" m
    WHERE o."month_id" = m."id" AND o."account_id" = target
      AND m."user_id" = t."user_id" AND m."year" * 12 + m."month" > from_key;
  END;
  $fn$ LANGUAGE plpgsql;

  CREATE OR REPLACE FUNCTION transactions_carry_openings() RETURNS trigger AS $fn$
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      PERFORM shift_later_openings(OLD, OLD."account_id", -1);
      IF OLD."destination_account_id" IS DISTINCT FROM OLD."account_id" THEN
        PERFORM shift_later_openings(OLD, OLD."destination_account_id", -1);
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM shift_later_openings(NEW, NEW."account_id", 1);
      IF NEW."destination_account_id" IS DISTINCT FROM NEW."account_id" THEN
        PERFORM shift_later_openings(NEW, NEW."destination_account_id", 1);
      END IF;
    END IF;
    RETURN NULL;
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS "${OPENING_CARRY_TRIGGER}" ON "transactions";
  CREATE TRIGGER "${OPENING_CARRY_TRIGGER}"
    AFTER INSERT OR UPDATE OR DELETE ON "transactions"
    FOR EACH ROW EXECUTE FUNCTION transactions_carry_openings();
`;

export async function installOpeningCarryTrigger(pool) {
  await pool.query(openingCarrySql);
}

// Serverless deploys never run runMigrations on an existing database, so install it on first use
export async function ensureOpeningCarryTrigger(pool) {
  const { rows } = await pool.query(
    'SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = $1) AS has_trigger;',
    [OPENING_CARRY_TRIGGER]
  );
  if (!rows[0]?.has_trigger) {
    console.log('[DevOps Auto-Init] Installing the opening carry-forward trigger...');
    await installOpeningCarryTrigger(pool);
  }
}
