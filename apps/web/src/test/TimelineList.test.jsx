import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineList } from '../components/TimelineList.jsx';

describe('Today Transactions Card Redesign (TimelineList)', () => {
  const mockBank = { _id: 'bank-1', id: 'bank-1', name: 'HDFC Salary Checking' };
  const mockWallet = { _id: 'wallet-1', id: 'wallet-1', name: 'Paytm Cash' };

  const mockMonth = {
    _id: 'month-1',
    year: 2026,
    month: 11,
    currencySymbol: '₹',
    daysInMonth: 30
  };

  const sampleEvents = [
    // 1. Settled debit transaction (spot expense)
    {
      sourceIndex: 1,
      day: 10,
      date: '2026-11-10',
      label: 'Team Lunch',
      amount: -450,
      displayAmount: -450,
      balanceAfter: 18550,
      displayBalance: 18550,
      itemType: 'transaction',
      isActual: true,
      bankAccountId: 'bank-1'
    },
    // 2. Planned budget item (commitment occurring today)
    {
      sourceIndex: 2,
      itemId: 'item-planned-1',
      _id: 'item-planned-1',
      day: 10,
      date: '2026-11-10',
      label: 'Internet Subscription',
      amount: -1200,
      displayAmount: -1200,
      balanceAfter: 17350,
      displayBalance: 17350,
      itemType: 'planned-item',
      isActual: false,
      isPaid: false,
      bankAccountId: 'bank-1'
    },
    // 3. Settled completed transfer
    {
      sourceIndex: 3,
      day: 10,
      date: '2026-11-10',
      label: 'Transfer to Wallet',
      amount: 0,
      displayAmount: 0,
      transferAmount: 5000,
      balanceAfter: 17350,
      displayBalance: 17350,
      itemType: 'transfer',
      isActual: true,
      sourceBankAccountId: 'bank-1',
      destinationWalletId: 'wallet-1'
    },
    // 4. Settled income credit
    {
      sourceIndex: 4,
      day: 10,
      date: '2026-11-10',
      label: 'Monthly Salary',
      amount: 25000,
      displayAmount: 25000,
      balanceAfter: 42350,
      displayBalance: 42350,
      itemType: 'salary',
      isSalary: true,
      isActual: true,
      bankAccountId: 'bank-1'
    }
  ];

  it('renders the 3-zone transaction card architecture (tx-card)', () => {
    const { container } = render(
      <TimelineList
        events={sampleEvents}
        month={mockMonth}
        currencySymbol="₹"
        bankAccounts={[mockBank]}
        wallets={[mockWallet]}
        currentDay={10}
      />
    );

    const cards = container.querySelectorAll('.tx-card');
    expect(cards.length).toBe(4);

    // Each card contains the 3 zones
    cards.forEach((card) => {
      expect(card.querySelector('.tx-card-left')).toBeInTheDocument();
      expect(card.querySelector('.tx-card-center')).toBeInTheDocument();
      expect(card.querySelector('.tx-card-right')).toBeInTheDocument();
    });
  });

  it('renders "Mark as Paid" button ONLY for planned items', () => {
    render(
      <TimelineList
        events={sampleEvents}
        month={mockMonth}
        currencySymbol="₹"
        bankAccounts={[mockBank]}
        wallets={[mockWallet]}
        currentDay={10}
      />
    );

    // Only 1 planned item among the 4 events
    const settleButtons = screen.getAllByRole('button', { name: /mark as paid/i });
    expect(settleButtons.length).toBe(1);

    // The button belongs to the Internet Subscription planned item
    const internetCard = screen.getByText('Internet Subscription').closest('.tx-card');
    expect(internetCard).toContainElement(settleButtons[0]);
  });

  it('renders settled items without actionable clutter (no buttons)', () => {
    render(
      <TimelineList
        events={sampleEvents}
        month={mockMonth}
        currencySymbol="₹"
        bankAccounts={[mockBank]}
        wallets={[mockWallet]}
        currentDay={10}
      />
    );

    // Team Lunch (settled debit) should have no action buttons inside its card
    const teamLunchCard = screen.getByText('Team Lunch').closest('.tx-card');
    expect(teamLunchCard.querySelectorAll('button').length).toBe(0);
    expect(teamLunchCard.querySelector('.tx-tag.tag-settled')).toBeInTheDocument();

    // Salary credit should have no action buttons
    const salaryCard = screen.getByText('Monthly Salary').closest('.tx-card');
    expect(salaryCard.querySelectorAll('button').length).toBe(0);
  });

  it('clicking "Mark as Paid" stops event propagation and calls onTogglePaid', () => {
    const handleSelectDay = vi.fn();
    const handleTogglePaid = vi.fn();

    render(
      <TimelineList
        events={sampleEvents}
        month={mockMonth}
        currencySymbol="₹"
        bankAccounts={[mockBank]}
        wallets={[mockWallet]}
        currentDay={10}
        onSelectDay={handleSelectDay}
        onTogglePaid={handleTogglePaid}
      />
    );

    const markAsPaidBtn = screen.getByRole('button', { name: /mark as paid/i });
    fireEvent.click(markAsPaidBtn);

    // onTogglePaid must be invoked with item ID and true
    expect(handleTogglePaid).toHaveBeenCalledWith('item-planned-1', true);

    // onSelectDay must NOT be triggered due to stopPropagation
    expect(handleSelectDay).not.toHaveBeenCalled();
  });

  it('clicking on the card body focuses the chart day', () => {
    const handleSelectDay = vi.fn();

    render(
      <TimelineList
        events={sampleEvents}
        month={mockMonth}
        currencySymbol="₹"
        bankAccounts={[mockBank]}
        wallets={[mockWallet]}
        currentDay={10}
        onSelectDay={handleSelectDay}
      />
    );

    const teamLunchCard = screen.getByText('Team Lunch').closest('.tx-card');
    fireEvent.click(teamLunchCard);

    expect(handleSelectDay).toHaveBeenCalledWith(10);
  });

  describe('Transaction Card Redesign & De-duplication', () => {
    const tieredEvents = [
      {
        sourceIndex: 10,
        day: 5,
        date: '2026-11-05',
        label: 'Healthy Coffee',
        amount: -200,
        displayAmount: -200,
        balanceAfter: 15000,
        displayBalance: 15000, // Safety floor is 10,000. 15,000 > 11,500 -> HEALTHY
        itemType: 'transaction',
        bankAccountId: 'bank-1'
      },
      {
        sourceIndex: 11,
        day: 6,
        date: '2026-11-06',
        label: 'Near-Floor Dinner',
        amount: -4000,
        displayAmount: -4000,
        balanceAfter: 11000,
        displayBalance: 11000, // Safety floor is 10,000. 11,000 <= 11,500 (15% buffer) -> WARNING
        itemType: 'transaction',
        bankAccountId: 'bank-1'
      },
      {
        sourceIndex: 12,
        day: 7,
        date: '2026-11-07',
        label: 'Breach Flight Ticket',
        amount: -3000,
        displayAmount: -3000,
        balanceAfter: 8000,
        displayBalance: 8000, // Safety floor is 10,000. 8,000 < 10,000 -> BREACHED
        itemType: 'transaction',
        bankAccountId: 'bank-1'
      }
    ];

    it('renders bal: XXXX exactly once per card within a status-colored micro-banner on the left side', () => {
      const { container } = render(
        <TimelineList
          events={tieredEvents}
          month={mockMonth}
          currencySymbol="₹"
          safetyFloor={10000}
          bankAccounts={[mockBank]}
          wallets={[mockWallet]}
        />
      );

      const cards = container.querySelectorAll('.tx-card');
      expect(cards.length).toBe(3);

      cards.forEach((card) => {
        // Must contain exactly 1 .tx-balance-chip
        const chips = card.querySelectorAll('.tx-balance-chip');
        expect(chips.length).toBe(1);

        // Must NOT contain balance in right amount column
        const rightCol = card.querySelector('.tx-card-amount-col');
        expect(rightCol.textContent).not.toMatch(/bal:/i);

        // Must NOT contain duplicate balance in metadata row
        const metaRow = card.querySelector('.tx-card-account');
        expect(metaRow.textContent).not.toMatch(/bal:/i);
      });
    });

    it('applies 3-tier status health classes correctly based on 15% safety floor buffer', () => {
      const { container } = render(
        <TimelineList
          events={tieredEvents}
          month={mockMonth}
          currencySymbol="₹"
          safetyFloor={10000}
          bankAccounts={[mockBank]}
          wallets={[mockWallet]}
        />
      );

      // Card 1: Healthy (>11.5k)
      const healthyCard = screen.getByText('Healthy Coffee').closest('.tx-card');
      const healthyChip = healthyCard.querySelector('.tx-balance-chip');
      expect(healthyChip).toHaveClass('balance-healthy');
      expect(healthyChip.textContent).toContain('bal: ₹150.00');

      // Card 2: Warning (10k <= bal <= 11.5k)
      const warningCard = screen.getByText('Near-Floor Dinner').closest('.tx-card');
      const warningChip = warningCard.querySelector('.tx-balance-chip');
      expect(warningChip).toHaveClass('balance-warning');
      expect(warningChip.textContent).toContain('bal: ₹110.00');

      // Card 3: Breached (<10k)
      const breachCard = screen.getByText('Breach Flight Ticket').closest('.tx-card');
      const breachChip = breachCard.querySelector('.tx-balance-chip');
      expect(breachChip).toHaveClass('balance-breached');
      expect(breachChip.textContent).toContain('bal: ₹80.00');
      expect(breachChip.querySelector('.inline-breach-glyph')).toBeInTheDocument();
    });

    it('renders clean metadata row containing exclusively account and date', () => {
      render(
        <TimelineList
          events={tieredEvents}
          month={mockMonth}
          currencySymbol="₹"
          safetyFloor={10000}
          bankAccounts={[mockBank]}
          wallets={[mockWallet]}
        />
      );

      const card = screen.getByText('Healthy Coffee').closest('.tx-card');
      const metaRow = card.querySelector('.tx-card-account');
      expect(metaRow).toHaveTextContent('HDFC Salary Checking');
      expect(metaRow).toHaveTextContent('Nov 5');
    });
  });
});
