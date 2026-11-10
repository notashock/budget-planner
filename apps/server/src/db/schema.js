import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users Table (Stripped 'username' to keep strictly auth/profile core)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// 2. Unified Accounts Table (Consolidated bank_accounts and wallets)
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'bank' or 'wallet'
    subtype: text('subtype').default('checking').notNull(), // checking, savings, salary, cash, prepaid, digital, other
    institution: text('institution').default('').notNull(),
    accountNumberMasked: text('account_number_masked').default('').notNull(),
    openingBalance: bigint('opening_balance', { mode: 'number' }).default(0).notNull(),
    openingBalanceDate: text('opening_balance_date'),
    currentBalance: bigint('current_balance', { mode: 'number' }).default(0).notNull(),
    minimumBalance: bigint('minimum_balance', { mode: 'number' }).default(0).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    color: text('color').default('#09090b').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_accounts_user').on(table.userId, table.isArchived)
  ]
);

// 3. Months Table (Stripped income_credit_day, consolidated salary_account_id)
export const months = pgTable(
  'months',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(), // 1 - 12
    startDate: text('start_date'), // 'YYYY-MM-DD'
    endDate: text('end_date'), // 'YYYY-MM-DD'
    openingBalance: bigint('opening_balance', { mode: 'number' }).default(0).notNull(),
    incomeAmount: bigint('income_amount', { mode: 'number' }).default(0).notNull(),
    incomeCreditDate: text('income_credit_date'),
    safetyFloor: bigint('safety_floor', { mode: 'number' }).default(0).notNull(),
    unplannedAllowance: bigint('unplanned_allowance', { mode: 'number' }).default(0).notNull(),
    currencySymbol: text('currency_symbol').default('₹').notNull(),
    salaryAccountId: uuid('salary_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    isSalaryCredited: boolean('is_salary_credited').default(false).notNull(),
    salaryCreditedDate: text('salary_credited_date'),
    isClosed: boolean('is_closed').default(false).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closingBalances: jsonb('closing_balances'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('uq_user_year_month').on(table.userId, table.year, table.month),
    index('idx_months_user_lookup').on(table.userId, table.year, table.month)
  ]
);

// 4. Month Account Openings (Normalized Starting Balances)
export const monthAccountOpenings = pgTable(
  'month_account_openings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    monthId: uuid('month_id')
      .references(() => months.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: uuid('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    amount: bigint('amount', { mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_openings_month').on(table.monthId),
    uniqueIndex('uq_openings_month_account').on(table.monthId, table.accountId)
  ]
);

// 5. Items Table (Planned Budget Items, date-driven, stripped day/dayOfMonth/originalDay/originalDate/accountType/bankAccountId/walletId)
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    monthId: uuid('month_id')
      .references(() => months.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // 'one-time', 'recurring'
    name: text('name').notNull(),
    category: text('category').default('General').notNull(),
    priority: integer('priority').default(0).notNull(),
    isFixed: boolean('is_fixed').default(false).notNull(),
    isIncome: boolean('is_income').default(false).notNull(),
    isPaid: boolean('is_paid').default(false).notNull(),
    amount: bigint('amount', { mode: 'number' }).default(0).notNull(),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    accountId: uuid('account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_items_month').on(table.monthId),
    index('idx_items_user').on(table.userId)
  ]
);

// 6. Transfers Table (Consolidated sourceAccountId and destinationAccountId)
export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    monthId: uuid('month_id').references(() => months.id, {
      onDelete: 'set null'
    }),
    date: text('date').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    sourceAccountId: uuid('source_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    destinationAccountId: uuid('destination_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    note: text('note').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_transfers_month').on(table.monthId),
    index('idx_transfers_user_date').on(table.userId, table.date)
  ]
);

// 7. Transactions Table (Unified Financial Entity)
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    monthId: uuid('month_id').references(() => months.id, {
      onDelete: 'set null'
    }),
    name: text('name').default('').notNull(),
    status: text('status').default('successful').notNull(), // 'planned', 'successful', 'cancelled'
    origin: text('origin').default('spot').notNull(), // 'spot', 'planned', 'goal', 'salary'
    amount: bigint('amount', { mode: 'number' }).notNull(), // effective/actual amount (positive = expense/debit, negative = refund/credit)
    date: text('date').notNull(), // effective/actual date 'YYYY-MM-DD'
    plannedAmount: bigint('planned_amount', { mode: 'number' }),
    plannedDate: text('planned_date'),
    category: text('category').default('Other').notNull(),
    note: text('note').default('').notNull(),
    isIncome: boolean('is_income').default(false).notNull(),
    recurrence: text('recurrence'), // 'monthly', etc. (for template compatibility)
    accountId: uuid('account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    destinationAccountId: uuid('destination_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    goalId: uuid('goal_id').references(() => goals.id, {
      onDelete: 'set null'
    }),
    // Domain & Migration Mappings:
    legacyItemId: uuid('legacy_item_id'),
    plannedItemId: uuid('planned_item_id').references(() => items.id, {
      onDelete: 'set null'
    }),
    refundTargetTransactionId: uuid('refund_target_transaction_id'),
    transferId: uuid('transfer_id').references(() => transfers.id, {
      onDelete: 'set null'
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_transactions_month').on(table.monthId),
    index('idx_transactions_month_status').on(table.monthId, table.status),
    index('idx_transactions_user_date').on(table.userId, table.date),
    index('idx_transactions_account_date').on(table.accountId, table.date),
    index('idx_transactions_user_status_date').on(table.userId, table.status, table.date),
    index('idx_transactions_dest_account').on(table.destinationAccountId),
    index('idx_transactions_goal').on(table.goalId),
    index('idx_transactions_month_origin_status').on(table.monthId, table.origin, table.status)
  ]
);

// 8. Goals Table (Target Purchases)
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    monthId: uuid('month_id')
      .references(() => months.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    targetAmount: bigint('target_amount', { mode: 'number' }).notNull(),
    targetDate: text('target_date'),
    status: text('status').default('logged').notNull(), // 'logged', 'scheduled', 'achieved', 'dropped'
    deferredReason: text('deferred_reason'),
    priority: integer('priority').default(0).notNull(),
    fundingAccountId: uuid('funding_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_goals_month').on(table.monthId)
  ]
);

// 9. Salary Templates Table (Recurring Fixed Income Specification)
export const salaryTemplates = pgTable(
  'salary_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    expectedCreditDay: integer('expected_credit_day').default(1).notNull(),
    receivingAccountId: uuid('receiving_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    periodType: text('period_type').default('calendar_month').notNull(), // 'calendar_month' | 'salary_cycle'
    effectiveDate: text('effective_date').notNull(), // 'YYYY-MM-DD'
    isActive: boolean('is_active').default(true).notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('idx_salary_templates_user').on(table.userId, table.isActive)
  ]
);

// 10. Settings Table (Profile Preferences & Income Mode)
export const settings = pgTable('settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  incomeMode: text('income_mode').default('salary').notNull(), // 'salary' | 'irregular' | 'both'
  periodType: text('period_type').default('calendar_month').notNull(), // 'calendar_month' | 'salary_cycle'
  defaultIncomeAmount: bigint('default_income_amount', { mode: 'number' }).default(0).notNull(),
  defaultIncomeCreditDay: integer('default_income_credit_day').default(1).notNull(),
  defaultSafetyFloor: bigint('default_safety_floor', { mode: 'number' }).default(0).notNull(),
  defaultUnplannedAllowance: bigint('default_unplanned_allowance', { mode: 'number' }).default(0).notNull(),
  dueWindowDays: integer('due_window_days').default(3).notNull(),
  currencySymbol: text('currency_symbol').default('₹').notNull(),
  defaultSalaryAccountId: uuid('default_salary_account_id').references(() => accounts.id, {
    onDelete: 'set null'
  }),
  aiAssistantEnabled: boolean('ai_assistant_enabled').default(false).notNull(),
  theme: text('theme').default('system').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Relations Definitions
export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  months: many(months),
  items: many(items),
  transactions: many(transactions),
  transfers: many(transfers),
  goals: many(goals),
  salaryTemplates: many(salaryTemplates),
  settings: one(settings)
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  items: many(items),
  transactions: many(transactions, { relationName: 'sourceAccountTransactions' }),
  incomingTransactions: many(transactions, { relationName: 'destinationAccountTransactions' }),
  transfersAsSource: many(transfers, { relationName: 'sourceAccountTransfers' }),
  transfersAsDestination: many(transfers, { relationName: 'destinationAccountTransfers' }),
  goals: many(goals)
}));

export const monthsRelations = relations(months, ({ one, many }) => ({
  user: one(users, { fields: [months.userId], references: [users.id] }),
  salaryAccount: one(accounts, { fields: [months.salaryAccountId], references: [accounts.id] }),
  accountOpenings: many(monthAccountOpenings),
  items: many(items),
  transactions: many(transactions),
  transfers: many(transfers),
  goals: many(goals)
}));

export const monthAccountOpeningsRelations = relations(monthAccountOpenings, ({ one }) => ({
  month: one(months, { fields: [monthAccountOpenings.monthId], references: [months.id] }),
  account: one(accounts, { fields: [monthAccountOpenings.accountId], references: [accounts.id] })
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  user: one(users, { fields: [items.userId], references: [users.id] }),
  month: one(months, { fields: [items.monthId], references: [months.id] }),
  account: one(accounts, { fields: [items.accountId], references: [accounts.id] }),
  transactions: many(transactions)
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  user: one(users, { fields: [transfers.userId], references: [users.id] }),
  month: one(months, { fields: [transfers.monthId], references: [months.id] }),
  sourceAccount: one(accounts, { fields: [transfers.sourceAccountId], references: [accounts.id], relationName: 'sourceAccountTransfers' }),
  destinationAccount: one(accounts, { fields: [transfers.destinationAccountId], references: [accounts.id], relationName: 'destinationAccountTransfers' })
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  month: one(months, { fields: [transactions.monthId], references: [months.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id], relationName: 'sourceAccountTransactions' }),
  destinationAccount: one(accounts, { fields: [transactions.destinationAccountId], references: [accounts.id], relationName: 'destinationAccountTransactions' }),
  goal: one(goals, { fields: [transactions.goalId], references: [goals.id] }),
  plannedItem: one(items, { fields: [transactions.plannedItemId], references: [items.id] }),
  transfer: one(transfers, { fields: [transactions.transferId], references: [transfers.id] })
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  month: one(months, { fields: [goals.monthId], references: [months.id] }),
  fundingAccount: one(accounts, { fields: [goals.fundingAccountId], references: [accounts.id] }),
  transactions: many(transactions)
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  user: one(users, { fields: [settings.userId], references: [users.id] }),
  defaultSalaryAccount: one(accounts, { fields: [settings.defaultSalaryAccountId], references: [accounts.id] })
}));

export const salaryTemplatesRelations = relations(salaryTemplates, ({ one }) => ({
  user: one(users, { fields: [salaryTemplates.userId], references: [users.id] }),
  receivingAccount: one(accounts, { fields: [salaryTemplates.receivingAccountId], references: [accounts.id] })
}));
