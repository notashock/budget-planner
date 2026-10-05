import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

    expect(screen.getByText(/^Purchase goals$/i)).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. Noise Cancelling Headphones, Laptop/i);
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
