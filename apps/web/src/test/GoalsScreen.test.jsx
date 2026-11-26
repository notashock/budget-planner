import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GoalsScreen } from '../screens/GoalsScreen.jsx';

describe('GoalsScreen', () => {
  const mockMonth = {
    _id: 'month-1',
    year: 2026,
    month: 10,
    openingBalance: 5000000,
    incomeAmount: 6000000,
    incomeCreditDate: '2026-10-01',
    safetyFloor: 1000000,
    currencySymbol: '₹'
  };

  it('renders GoalsScreen and submits a new purchase goal without reference errors', async () => {
    const handleCreateGoal = vi.fn().mockResolvedValue({});

    render(
      <GoalsScreen
        month={mockMonth}
        goals={[]}
        items={[]}
        transactions={[]}
        onCreateGoal={handleCreateGoal}
        onConvertGoalToItem={vi.fn()}
        onDeferGoal={vi.fn()}
        onReactivateGoal={vi.fn()}
        onDeleteGoal={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Goals' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New goal' }));
    const nameInput = await screen.findByPlaceholderText(/e\.g\. Noise Cancelling Headphones, Laptop/i);
    const amountInput = screen.getByPlaceholderText('0.00');

    fireEvent.change(nameInput, { target: { value: 'Sony WH-1000XM5' } });
    fireEvent.change(amountInput, { target: { value: '250' } });

    const submitBtn = screen.getByRole('button', { name: /Set purchase goal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sony WH-1000XM5',
          targetAmount: 25000,
          priority: 0
        })
      );
    });
  });
});

describe('GoalsScreen layout (Phase D)', () => {
  const goals = [
    { _id: 'g1', name: 'Headphones', targetAmount: 800000, priority: 0, status: 'logged',
      recommendation: { feasible: true, recommendedDate: '2026-11-26', savingsBuffer: 120000 } },
    { _id: 'g2', name: 'Laptop', targetAmount: 4000000, priority: 1, status: 'logged',
      recommendation: { feasible: false, projectedFloorDeficit: -1500000, lowestDate: '2026-11-28' } },
    { _id: 'g3', name: 'Desk', targetAmount: 1200000, priority: 1, status: 'scheduled' },
    { _id: 'g4', name: 'Trip', targetAmount: 6000000, priority: 2, status: 'deferred' },
    { _id: 'g5', name: 'Old phone', targetAmount: 900000, priority: 2, status: 'achieved' }
  ];
  const renderGoals = (props = {}) => render(
    <GoalsScreen goals={goals} onConvertGoalToItem={vi.fn()} onDeferGoal={vi.fn()} onReactivateGoal={vi.fn()}
      onDeleteGoal={vi.fn()} onUpdateGoal={vi.fn()} {...props} />
  );

  it('groups goals: Ready to buy shelf, then Saving, Scheduled and Later; past goals behind ⋯', () => {
    renderGoals();
    expect(within(screen.getByRole('region', { name: 'Ready to buy' })).getByText('Headphones')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Saving' })).getByText('₹15,000.00 short this month')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Scheduled' })).getByText('Desk')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Later' })).getByText('Trip')).toBeInTheDocument();
    expect(screen.queryByText('Old phone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Goal options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Past goals' }));
    expect(within(screen.getByRole('region', { name: 'Past goals' })).getByText('Old phone')).toBeInTheDocument();
  });

  it('a ready goal\'s page answers "can I afford it this month" and schedules it', () => {
    const onConvertGoalToItem = vi.fn();
    renderGoals({ onConvertGoalToItem });
    fireEvent.click(screen.getByRole('button', { name: /Headphones/ }));
    const page = within(screen.getByTestId('goal-page'));
    expect(page.getByRole('note')).toHaveTextContent(/Fits this month\. Safe to buy from .*Nov 26/);
    fireEvent.click(page.getByRole('button', { name: 'Schedule' }));
    expect(onConvertGoalToItem).toHaveBeenCalledWith('g1');
  });

  it('a goal that does not fit says by how much and offers Defer; ⋯ deletes it', () => {
    const onDeferGoal = vi.fn();
    const onDeleteGoal = vi.fn();
    renderGoals({ onDeferGoal, onDeleteGoal });
    fireEvent.click(screen.getByRole('button', { name: /Laptop/ }));
    expect(screen.getByRole('note')).toHaveTextContent(/Doesn’t fit this month: it would take you ₹15,000\.00 below your minimum/);
    fireEvent.click(screen.getByRole('button', { name: 'Defer to next month' }));
    expect(onDeferGoal).toHaveBeenCalledWith('g2');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Laptop' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDeleteGoal).toHaveBeenCalledWith('g2');
    expect(screen.queryByTestId('goal-page')).not.toBeInTheDocument();
  });
});
