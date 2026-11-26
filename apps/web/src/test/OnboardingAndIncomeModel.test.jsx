import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingModal } from '../components/OnboardingModal.jsx';
import { PlanScreen } from '../screens/PlanScreen.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    createAccount: vi.fn(),
    updateBankAccount: vi.fn(),
    saveSalaryTemplate: vi.fn(),
    updateSettings: vi.fn()
  }
}));

const toAccount = () => fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));
const fillAccount = (name, balance) => {
  fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: name } });
  if (balance != null) fireEvent.change(screen.getByLabelText(/^Balance/i), { target: { value: balance } });
};

describe('OnboardingModal & Dual Income Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on a welcome page, then blocks an account with no name', async () => {
    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    expect(screen.getByText(/Welcome to Budget Planner/i)).toBeInTheDocument();
    toAccount();
    expect(screen.getByText(/Add your main account/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Step 1 of 3/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(await screen.findByText(/Please provide an account name/i)).toBeInTheDocument();
    expect(api.createAccount).not.toHaveBeenCalled();
    expect(handleCompleted).not.toHaveBeenCalled();
  });

  it('creates the account once, even after going back to fix it', async () => {
    api.createAccount.mockResolvedValueOnce({ id: 'acc-1', name: 'Main Checking', type: 'bank', openingBalance: 5000000 });
    api.updateBankAccount.mockResolvedValueOnce({ id: 'acc-1', name: 'Main', openingBalance: 6000000 });
    render(<OnboardingModal currencySymbol="₹" onCompleted={vi.fn()} />);

    toAccount();
    fillAccount('Main Checking', '50000');
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

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
    expect(await screen.findByText(/How are you paid/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    fillAccount('Main', '60000');
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(api.updateBankAccount).toHaveBeenCalledWith('acc-1', expect.objectContaining({ name: 'Main', openingBalance: 6000000 })));
    expect(api.createAccount).toHaveBeenCalledTimes(1);
  });

  it('variable income skips the salary page and completes onboarding', async () => {
    api.createAccount.mockResolvedValueOnce({ id: 'acc-2', name: 'Paytm', type: 'wallet', openingBalance: 0 });
    api.updateSettings.mockResolvedValueOnce({ incomeMode: 'irregular' });

    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    toAccount();
    fireEvent.click(screen.getByRole('radio', { name: /Wallet/i }));
    fillAccount('Paytm');
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(await screen.findByText(/How are you paid/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Variable or freelance/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Finish$/i }));
    expect(await screen.findByText(/You’re all set/i)).toBeInTheDocument();
    expect(api.updateSettings).toHaveBeenCalledWith({ incomeMode: 'irregular' });
    expect(api.saveSalaryTemplate).not.toHaveBeenCalled();
    expect(handleCompleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Start Planning/i }));
    expect(handleCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ incomeMode: 'irregular', account: expect.objectContaining({ id: 'acc-2' }) })
    );
  });

  it('a regular salary saves the salary template', async () => {
    api.createAccount.mockResolvedValueOnce({ id: 'acc-salary', name: 'Salary Account', type: 'bank', openingBalance: 2500000 });
    api.updateBankAccount.mockResolvedValueOnce({});
    api.saveSalaryTemplate.mockResolvedValueOnce({ id: 'tmpl-1', amount: 12000000, expectedCreditDay: 1, periodType: 'salary_cycle' });

    const handleCompleted = vi.fn();
    render(<OnboardingModal currencySymbol="₹" onCompleted={handleCompleted} />);

    toAccount();
    fillAccount('Salary Account', '25000');
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(await screen.findByText(/How are you paid/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));

    expect(await screen.findByText(/Your salary/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '120000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Finish$/i }));

    await waitFor(() => {
      expect(api.saveSalaryTemplate).toHaveBeenCalledWith({
        amount: 12000000,
        expectedCreditDay: expect.any(Number),
        receivingAccountId: 'acc-salary',
        periodType: 'salary_cycle',
        effectiveDate: expect.any(String)
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: /Start Planning/i }));
    expect(handleCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        incomeMode: 'salary',
        account: expect.objectContaining({ id: 'acc-salary' }),
        template: expect.objectContaining({ id: 'tmpl-1' })
      })
    );
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
