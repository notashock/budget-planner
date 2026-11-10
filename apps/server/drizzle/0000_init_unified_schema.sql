CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text DEFAULT 'checking' NOT NULL,
	"institution" text DEFAULT '' NOT NULL,
	"account_number_masked" text DEFAULT '' NOT NULL,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"opening_balance_date" text,
	"current_balance" bigint DEFAULT 0 NOT NULL,
	"minimum_balance" bigint DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#09090b' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_amount" bigint NOT NULL,
	"target_date" text,
	"status" text DEFAULT 'logged' NOT NULL,
	"deferred_reason" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"funding_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"is_income" boolean DEFAULT false NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"date" text NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_account_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "months" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"start_date" text,
	"end_date" text,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"income_amount" bigint DEFAULT 0 NOT NULL,
	"income_credit_date" text,
	"safety_floor" bigint DEFAULT 0 NOT NULL,
	"unplanned_allowance" bigint DEFAULT 0 NOT NULL,
	"currency_symbol" text DEFAULT '₹' NOT NULL,
	"salary_account_id" uuid,
	"is_salary_credited" boolean DEFAULT false NOT NULL,
	"salary_credited_date" text,
	"is_closed" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"closing_balances" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"expected_credit_day" integer DEFAULT 1 NOT NULL,
	"receiving_account_id" uuid,
	"period_type" text DEFAULT 'calendar_month' NOT NULL,
	"effective_date" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"income_mode" text DEFAULT 'salary' NOT NULL,
	"period_type" text DEFAULT 'calendar_month' NOT NULL,
	"default_income_amount" bigint DEFAULT 0 NOT NULL,
	"default_income_credit_day" integer DEFAULT 1 NOT NULL,
	"default_safety_floor" bigint DEFAULT 0 NOT NULL,
	"default_unplanned_allowance" bigint DEFAULT 0 NOT NULL,
	"due_window_days" integer DEFAULT 3 NOT NULL,
	"currency_symbol" text DEFAULT '₹' NOT NULL,
	"default_salary_account_id" uuid,
	"ai_assistant_enabled" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'successful' NOT NULL,
	"origin" text DEFAULT 'spot' NOT NULL,
	"amount" bigint NOT NULL,
	"date" text NOT NULL,
	"planned_amount" bigint,
	"planned_date" text,
	"category" text DEFAULT 'Other' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"is_income" boolean DEFAULT false NOT NULL,
	"recurrence" text,
	"account_id" uuid,
	"destination_account_id" uuid,
	"goal_id" uuid,
	"legacy_item_id" uuid,
	"planned_item_id" uuid,
	"refund_target_transaction_id" uuid,
	"transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month_id" uuid,
	"date" text NOT NULL,
	"amount" bigint NOT NULL,
	"source_account_id" uuid,
	"destination_account_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_month_id_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_funding_account_id_accounts_id_fk" FOREIGN KEY ("funding_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_month_id_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_account_openings" ADD CONSTRAINT "month_account_openings_month_id_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_account_openings" ADD CONSTRAINT "month_account_openings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "months" ADD CONSTRAINT "months_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "months" ADD CONSTRAINT "months_salary_account_id_accounts_id_fk" FOREIGN KEY ("salary_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_templates" ADD CONSTRAINT "salary_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_templates" ADD CONSTRAINT "salary_templates_receiving_account_id_accounts_id_fk" FOREIGN KEY ("receiving_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_salary_account_id_accounts_id_fk" FOREIGN KEY ("default_salary_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_month_id_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_planned_item_id_items_id_fk" FOREIGN KEY ("planned_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_month_id_months_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."months"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_account_id_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id","is_archived");--> statement-breakpoint
CREATE INDEX "idx_goals_month" ON "goals" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "idx_items_month" ON "items" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "idx_items_user" ON "items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_openings_month" ON "month_account_openings" USING btree ("month_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_openings_month_account" ON "month_account_openings" USING btree ("month_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_year_month" ON "months" USING btree ("user_id","year","month");--> statement-breakpoint
CREATE INDEX "idx_months_user_lookup" ON "months" USING btree ("user_id","year","month");--> statement-breakpoint
CREATE INDEX "idx_salary_templates_user" ON "salary_templates" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_transactions_month" ON "transactions" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_month_status" ON "transactions" USING btree ("month_id","status");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_date" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_transactions_account_date" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_status_date" ON "transactions" USING btree ("user_id","status","date");--> statement-breakpoint
CREATE INDEX "idx_transactions_dest_account" ON "transactions" USING btree ("destination_account_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_goal" ON "transactions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_month_origin_status" ON "transactions" USING btree ("month_id","origin","status");--> statement-breakpoint
CREATE INDEX "idx_transfers_month" ON "transfers" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "idx_transfers_user_date" ON "transfers" USING btree ("user_id","date");