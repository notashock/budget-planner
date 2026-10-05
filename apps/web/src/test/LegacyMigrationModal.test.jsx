import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountsScreen } from '../screens/AccountsScreen.jsx';
import { Header } from '../components/Header.jsx';
import { SalarySafelineModal } from '../components/SalarySafelineModal.jsx';
import { TransferCalculationsModal } from '../components/TransferCalculationsModal.jsx';

describe('Single Unified Migration Flow & Header Salary/Safeline Linking', () => {
  const mockStats = {
    monthCount: 3,
    itemCount: 5,
    transactionCount: 12,
    goalCount: 2,
    currentOpeningBalance: 1918185, // ₹19,181.85
    currentIncomeAmount: 1979900,  // ₹19,799.00
    incomeCreditDate: '2026-10-01'
  };

  const mockBank = {
    _id: 'bank-1',
    id: 'bank-1',
    name: 'HDFC Salary Account',
    institution: 'HDFC Bank',
    accountType: 'salary',
    isPrimary: true,
    openingBalance: 1918185
  };

  const mockMonth = {
    _id: 'month-1',
    year: 2026,
    month: 10,
    openingBalance: 1918185,
    incomeAmount: 1979900,
    incomeCreditDate: '2026-10-01',
    salaryBankAccountId: 'bank-1',
    safetyFloor: 1000000
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TransferCalculationsModal (Single Unified Migration Flow)', () => {
    it('renders all-in-one setup when 0 accounts exist and submits migration payload', async () => {
      const handleMigrate = vi.fn().mockResolvedValue({});
      const handleClose = vi.fn();

      render(
        <TransferCalculationsModal
          isOpen={true}
          onClose={handleClose}
          migrationStats={mockStats}
          month={mockMonth}
          items={[{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }]}
          bankAccounts={[]}
          currencySymbol="₹"
          onMigrate={handleMigrate}
        />
      );

      // Verify transfer breakdown preview
      expect(screen.getByText('Transfer Existing Calculations')).toBeInTheDocument();
      expect(screen.getByText('₹19,181.85')).toBeInTheDocument();
      expect(screen.getByText('₹19,799.00')).toBeInTheDocument();
      expect(screen.getByText('5 items')).toBeInTheDocument();
      expect(screen.getByText('12 records')).toBeInTheDocument();

      // Form inputs for primary account
      const nameInput = screen.getByLabelText(/bank account name/i);
      const instInput = screen.getByLabelText(/financial institution/i);

      fireEvent.change(nameInput, { target: { value: 'Primary Checking' } });
      fireEvent.change(instInput, { target: { value: 'HDFC Bank' } });

      const submitBtn = screen.getByRole('button', { name: /create account & transfer all data/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleMigrate).toHaveBeenCalledWith({
          name: 'Primary Checking',
          institution: 'HDFC Bank',
          accountType: 'checking',
          makePrimary: true,
          linkSalary: true
        });
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('renders target account selector when accounts already exist', async () => {
      const handleMigrate = vi.fn().mockResolvedValue({});
      const handleClose = vi.fn();

      render(
        <TransferCalculationsModal
          isOpen={true}
          onClose={handleClose}
          migrationStats={mockStats}
          month={mockMonth}
          bankAccounts={[mockBank]}
          currencySymbol="₹"
          onMigrate={handleMigrate}
        />
      );

      expect(screen.getByLabelText(/target bank account to receive calculations/i)).toBeInTheDocument();
      const submitBtn = screen.getByRole('button', { name: /transfer all calculations/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleMigrate).toHaveBeenCalledWith({
          existingBankAccountId: 'bank-1'
        });
        expect(handleClose).toHaveBeenCalled();
      });
    });
  });

  describe('SalarySafelineModal & Header Integration', () => {
    it('renders Link Salary & Safeline button beside month in Header and opens modal on click', () => {
      const handleOpenSalarySafeline = vi.fn();

      render(
        <Header
          user={{ email: 'test@example.com' }}
          months={[mockMonth]}
          currentMonth={mockMonth}
          simulation={{ lowestBalance: 500000, floorBreached: false }}
          onSelectMonth={vi.fn()}
          onOpenCreateMonth={vi.fn()}
          onOpenRollover={vi.fn()}
          onOpenSalarySafeline={handleOpenSalarySafeline}
          onLogout={vi.fn()}
          theme="dark"
          onToggleTheme={vi.fn()}
          activeTab="plan"
          onSelectTab={vi.fn()}
        />
      );

      const linkBtn = screen.getByTestId('link-salary-safeline-btn');
      expect(linkBtn).toBeInTheDocument();
      expect(screen.getByText('Link Salary & Safeline')).toBeInTheDocument();

      fireEvent.click(linkBtn);
      expect(handleOpenSalarySafeline).toHaveBeenCalled();
    });

    it('renders SalarySafelineModal with salary account, salary amount, and safeline floor, then saves updates', async () => {
      const handleSave = vi.fn().mockResolvedValue({});
      const handleClose = vi.fn();

      render(
        <SalarySafelineModal
          isOpen={true}
          onClose={handleClose}
          month={mockMonth}
          bankAccounts={[mockBank]}
          currencySymbol="₹"
          onSave={handleSave}
        />
      );

      expect(screen.getByText('Link Salary & Safeline')).toBeInTheDocument();
      expect(screen.getByLabelText(/salary credited account/i)).toHaveValue('bank-1');
      expect(screen.getByLabelText(/monthly salary amount/i)).toHaveValue(19799);
      expect(screen.getByLabelText(/overall safeline floor/i)).toHaveValue(10000);

      // Edit values
      fireEvent.change(screen.getByLabelText(/monthly salary amount/i), { target: { value: '25000' } });
      fireEvent.change(screen.getByLabelText(/overall safeline floor/i), { target: { value: '15000' } });

      const saveBtn = screen.getByRole('button', { name: /save salary & safeline/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(handleSave).toHaveBeenCalledWith({
          salaryBankAccountId: 'bank-1',
          incomeAmount: 2500000,
          safetyFloor: 1500000
        });
        expect(handleClose).toHaveBeenCalled();
      });
    });
  });

  describe('AccountsScreen Cleanup (Month Settings & Migration Removed)', () => {
    it('does NOT render Month Settings card or inline migration card on AccountsScreen', () => {
      render(
        <AccountsScreen
          bankAccounts={[]}
          wallets={[]}
          transfers={[]}
          month={mockMonth}
        />
      );

      // Month settings card is completely removed
      expect(screen.queryByText(/current month settings/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/salary depository bank/i)).not.toBeInTheDocument();

      // Open Add Bank modal
      const addBankBtn = screen.getByRole('button', { name: /add bank/i });
      fireEvent.click(addBankBtn);

      // Migration suggestion card is removed from Add Bank modal
      expect(screen.queryByTestId('migration-suggestion-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('salary-depository-consent-field')).not.toBeInTheDocument();

      // Clean Add Bank modal is present
      expect(screen.getByLabelText(/account name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/opening balance/i)).toBeEnabled();
    });
  });
});
