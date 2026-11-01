import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingModal } from '../components/OnboardingModal.jsx';
import { PlanScreen } from '../screens/PlanScreen.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    createAccount: vi.fn(),
    saveSalaryTemplate: vi.fn(),
    updateSettings: vi.fn()
  }
}));

describe('OnboardingModal & Dual Income Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Step 1 blocks submission when account name is empty', async () => {
    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    expect(screen.getByText(/Set Up Your Initial Account/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

    const form = screen.getByRole('button', { name: /Continue to Step 2/i }).closest('form');
    fireEvent.submit(form);

    expect(await screen.findByText(/Please provide an account name/i)).toBeInTheDocument();
    expect(api.createAccount).not.toHaveBeenCalled();
    expect(handleCompleted).not.toHaveBeenCalled();
  });

  it('Step 1 succeeds and moves to Step 2 when valid account details are submitted', async () => {
    api.createAccount.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Main Checking',
      type: 'bank',
      openingBalance: 50000
    });

    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    fireEvent.change(screen.getByLabelText(/ACCOUNT NAME/i), {
      target: { value: 'Main Checking' }
    });
    fireEvent.change(screen.getByLabelText(/OPENING BALANCE/i), {
      target: { value: '50000' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to Step 2/i }));

    await waitFor(() => {
      expect(api.createAccount).toHaveBeenCalledWith({
        name: 'Main Checking',
        type: 'bank',
        accountType: 'salary',
        openingBalance: 5000000,
        openingBalanceDate: expect.any(String),
        isPrimary: true
      });
    });

    expect(await screen.findByText(/Income Configuration/i)).toBeInTheDocument();
  });

  it('Step 2 irregular income skips template/month creation and completes onboarding', async () => {
    api.createAccount.mockResolvedValueOnce({
      id: 'acc-2',
      name: 'Digital Wallet Pay',
      type: 'wallet',
      openingBalance: 1000000
    });
    api.updateSettings.mockResolvedValueOnce({ incomeMode: 'irregular' });

    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    // Step 1: select Digital Wallet (role="radio")
    fireEvent.click(screen.getByRole('radio', { name: /Digital Wallet/i }));
    fireEvent.change(screen.getByLabelText(/ACCOUNT NAME/i), {
      target: { value: 'Digital Wallet Pay' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue to Step 2/i }));

    // Step 2
    expect(await screen.findByText(/Income Configuration/i)).toBeInTheDocument();

    // Select "Variable / Freelance" (role="radio")
    fireEvent.click(screen.getByRole('radio', { name: /Variable \/ Freelance/i }));

    const finishBtn = screen.getByRole('button', { name: /Complete Setup & Enter App/i });
    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({ incomeMode: 'irregular' });
      expect(api.saveSalaryTemplate).not.toHaveBeenCalled();
      expect(handleCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          incomeMode: 'irregular',
          account: expect.objectContaining({ id: 'acc-2' })
        })
      );
    });
  });

  it('Step 2 fixed regular salary creates salary template with versioning', async () => {
    api.createAccount.mockResolvedValueOnce({
      id: 'acc-salary',
      name: 'Salary Account',
      type: 'bank',
      openingBalance: 2500000
    });
    api.saveSalaryTemplate.mockResolvedValueOnce({
      id: 'tmpl-1',
      amount: 12000000,
      expectedCreditDay: 1,
      periodType: 'salary_cycle'
    });

    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    // Step 1
    fireEvent.change(screen.getByLabelText(/ACCOUNT NAME/i), {
      target: { value: 'Salary Account' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue to Step 2/i }));

    // Step 2
    expect(await screen.findByText(/Income Configuration/i)).toBeInTheDocument();

    // Salary inputs
    const salaryInput = screen.getByLabelText(/EXPECTED AMOUNT/i);
    fireEvent.change(salaryInput, { target: { value: '120000' } });

    const finishBtn = screen.getByRole('button', { name: /Complete Setup & Enter App/i });
    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(api.saveSalaryTemplate).toHaveBeenCalledWith({
        amount: 12000000,
        expectedCreditDay: expect.any(Number),
        receivingAccountId: 'acc-salary',
        periodType: 'salary_cycle',
        effectiveDate: expect.any(String)
      });
      expect(handleCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          incomeMode: 'salary',
          account: expect.objectContaining({ id: 'acc-salary' }),
          template: expect.objectContaining({ id: 'tmpl-1' })
        })
      );
    });
  });
});

describe('PlanScreen Irregular Earner & Null Month Graceful Degradation', () => {
  it('renders Runway & Smoothed Income dashboard when month is null without crashing', () => {
    const transactions = [
      { id: '1', title: 'Consulting Q1', amount: 300000, direction: 'income', status: 'successful', date: '2026-01-15' },
      { id: '2', title: 'Freelance Q2', amount: 200000, direction: 'income', status: 'successful', date: '2026-04-10' },
      { id: '3', title: 'Server Hosting', amount: 12000, direction: 'expense', status: 'successful', date: '2026-05-01' }
    ];
    const bankAccounts = [
      { id: 'b1', name: 'Savings', openingBalance: 150000 }
    ];

    render(
      <PlanScreen
        month={null}
        items={[]}
        transactions={transactions}
        bankAccounts={bankAccounts}
        wallets={[]}
        settings={{ currencySymbol: '₹', incomeMode: 'irregular' }}
      />
    );

    expect(screen.getByText(/Emergency Runway/i)).toBeInTheDocument();
    expect(screen.getByText(/Smoothed Income/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Liquid Balance/i)).toBeInTheDocument();
    expect(screen.getByText(/Trailing 12-Month Inflow/i)).toBeInTheDocument();
  });

  it('renders safely when there is zero spending or empty transactions without division by zero', () => {
    const bankAccounts = [
      { id: 'b1', name: 'Empty Bank', openingBalance: 50000 }
    ];

    render(
      <PlanScreen
        month={null}
        items={[]}
        transactions={[]}
        bankAccounts={bankAccounts}
        wallets={[]}
        settings={{ currencySymbol: '₹', incomeMode: 'irregular' }}
      />
    );

    expect(screen.getByText(/Emergency Runway/i)).toBeInTheDocument();
    // Zero spending => runway = Indefinite
    expect(screen.getByText(/Indefinite/i)).toBeInTheDocument();

    // Switch to quarterly view to verify empty state renders gracefully
    fireEvent.click(screen.getByRole('button', { name: /Quarterly/i }));
    expect(screen.getByText(/No quarterly transaction history found yet/i)).toBeInTheDocument();
  });
});
