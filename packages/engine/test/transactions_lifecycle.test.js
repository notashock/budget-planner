import { describe, it, expect } from 'vitest';
import { deriveTransactionState, simulate } from '../src/index.js';

describe('Transaction Lifecycle & State Derivation', () => {
  it('correctly derives due and overdue states using local date string', () => {
    const today = '2026-10-20';

    // 1. Successful transactions always remain successful
    expect(deriveTransactionState({ status: 'successful', date: '2026-10-15' }, today)).toBe('successful');

    // 2. Cancelled transactions always remain cancelled
    expect(deriveTransactionState({ status: 'cancelled', date: '2026-10-15' }, today)).toBe('cancelled');

    // 3. Planned transaction in the past is overdue
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-19' }, today)).toBe('overdue');

    // 4. Planned transaction on today is due
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-20' }, today)).toBe('due');

    // 5. Planned transaction within 3 days is due
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-22' }, today, 3)).toBe('due');
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-23' }, today, 3)).toBe('due');

    // 6. Planned transaction beyond 3 days is planned
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-24' }, today, 3)).toBe('planned');
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-30' }, today, 3)).toBe('planned');
  });

  it('respects configurable due window days', () => {
    const today = '2026-10-20';
    // With 1 day window: +2 days is 'planned'
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-22' }, today, 1)).toBe('planned');
    // With 5 day window: +5 days is 'due'
    expect(deriveTransactionState({ status: 'planned', plannedDate: '2026-10-25' }, today, 5)).toBe('due');
  });

  it('isolates planned transactions from actual spending totals', () => {
    const settings = {
      openingBalance: 100000,
      incomeAmount: 0,
      scale: 100,
      currentDay: 20
    };

    const plannedTx = {
      id: 'tx-rent',
      name: 'Rent',
      status: 'planned',
      origin: 'planned',
      amount: 40000,
      plannedAmount: 40000,
      date: '2026-10-25',
      plannedDate: '2026-10-25'
    };

    const spotTx = {
      id: 'tx-chips',
      name: 'Chips',
      status: 'successful',
      origin: 'spot',
      amount: 500,
      date: '2026-10-15'
    };

    const cancelledTx = {
      id: 'tx-concert',
      name: 'Concert',
      status: 'cancelled',
      origin: 'planned',
      amount: 8000,
      date: '2026-10-28'
    };

    // When plannedTx is still planned:
    const result1 = simulate(settings, [], { year: 2026, month: 10 }, [plannedTx, spotTx, cancelledTx]);

    // Only successful spotTx should deduct from today's balance (100,000 - 500 = 99,500)
    expect(result1.todayBalance).toBe(99500);

    // Cancelled transaction is ignored completely
    const hasCancelled = result1.events.some((e) => e.label && e.label.includes('Concert'));
    expect(hasCancelled).toBe(false);

    // Now mark rent as successful:
    const paidRentTx = {
      ...plannedTx,
      status: 'successful',
      amount: 42000, // edited actual amount
      date: '2026-10-20' // paid today
    };

    const result2 = simulate(settings, [], { year: 2026, month: 10 }, [paidRentTx, spotTx, cancelledTx]);

    // Now both spotTx and paidRentTx count toward today's balance (100,000 - 500 - 42,000 = 57,500)
    expect(result2.todayBalance).toBe(57500);
  });

  it('processes origin === "transfer" transactions with zero-sum aggregate effect and bilateral account debits/credits', () => {
    const bankA = { id: 'acc-hdfc', name: 'HDFC Bank', openingBalance: 50000 };
    const bankB = { id: 'acc-icici', name: 'ICICI Bank', openingBalance: 20000 };

    const settings = {
      openingBalance: 70000,
      scale: 100,
      currentDay: 20,
      accounts: [bankA, bankB],
      accountOpeningBalances: [
        { accountId: 'acc-hdfc', amount: 50000 },
        { accountId: 'acc-icici', amount: 20000 }
      ]
    };

    const transferTx = {
      id: 'tx-transfer-1',
      name: 'Inter-Account Transfer',
      status: 'successful',
      origin: 'transfer',
      amount: 15000,
      date: '2026-10-15',
      accountId: 'acc-hdfc',
      destinationAccountId: 'acc-icici'
    };

    const result = simulate(settings, [], { year: 2026, month: 10 }, [transferTx], [], [], [bankA, bankB]);

    // Aggregate todayBalance remains 70,000 (net 0)
    expect(result.todayBalance).toBe(70000);

    // Transfer event exists with itemType: 'transfer'
    const transferEvent = result.events.find((e) => e.itemType === 'transfer');
    expect(transferEvent).toBeDefined();
    expect(transferEvent.amount).toBe(0); // Zero on aggregate
    expect(transferEvent.sourceAccountId).toBe('acc-hdfc');
    expect(transferEvent.destinationAccountId).toBe('acc-icici');

    // Per-account running balance verification:
    // HDFC debited: 50,000 - 15,000 = 35,000
    // ICICI credited: 20,000 + 15,000 = 35,000
    const finalEvent = result.events[result.events.length - 1];
    expect(finalEvent.accountBalances?.['acc-hdfc']).toBe(35000);
    expect(finalEvent.accountBalances?.['acc-icici']).toBe(35000);
  });
});
