ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "destination_account_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_dest_account" ON "transactions" ("destination_account_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
