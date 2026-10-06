import React, { useState, useEffect } from 'react';
import { DatePicker } from './DatePicker.jsx';
import { BuildingLibraryIcon, WalletIcon } from './Icons.jsx';
import { CustomSelect } from './CustomSelect.jsx';
import { formatCurrency } from '@budget/engine';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function CreateMonthModal({
  isOpen,
  onClose,
  onCreate,
  settings,
  bankAccounts = [],
  wallets = [],
  months = [],
  currentMonth = null
}) {
  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [incomeCreditDate, setIncomeCreditDate] = useState(
    `${currentYear}-${String(currentMonthNum).padStart(2, '0')}-01`
  );
  const [openingBalance, setOpeningBalance] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('0');
  const [safetyFloor, setSafetyFloor] = useState('0');

  const [salaryBankAccountId, setSalaryBankAccountId] = useState('');
  const [isSalaryCredited, setIsSalaryCredited] = useState(true);
  const [useCompositeBalances, setUseCompositeBalances] = useState(false);
  const [accountBalances, setAccountBalances] = useState({});

  // Fresh user primary bank account setup state
  const [freshBankName, setFreshBankName] = useState('Primary Checking');
  const [freshBankInstitution, setFreshBankInstitution] = useState('');
  const [freshBankAccountType, setFreshBankAccountType] = useState('checking');
  const [freshBankBalance, setFreshBankBalance] = useState('');

  const updateDefaultsFromPredecessor = (targetY, targetM) => {
    const pastMonths = (months || []).filter(
      (m) => m.year < Number(targetY) || (m.year === Number(targetY) && m.month < Number(targetM))
    );
    let predecessor = null;
    if (pastMonths.length > 0) {
      pastMonths.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
      predecessor = pastMonths[0];
    } else if (currentMonth && (currentMonth.year < Number(targetY) || (currentMonth.year === Number(targetY) && currentMonth.month < Number(targetM)))) {
      predecessor = currentMonth;
    }

    if (predecessor) {
      setIncomeAmount(predecessor.incomeAmount != null ? (predecessor.incomeAmount / 100).toString() : '0');
      setSafetyFloor(predecessor.safetyFloor != null ? (predecessor.safetyFloor / 100).toString() : '0');
    } else {
      setIncomeAmount('0');
      setSafetyFloor('0');
    }
  };

  useEffect(() => {
    if (isOpen) {
      const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
      setSalaryBankAccountId(primaryBank?._id || primaryBank?.id || '');

      updateDefaultsFromPredecessor(year, month);

      // Initialize composite account balances from account current opening balances
      const initialMap = {};
      let sum = 0;
      bankAccounts.forEach((b) => {
        const val = b.openingBalance ? (b.openingBalance / 100).toString() : '0';
        initialMap[`bank_${b._id || b.id}`] = val;
        sum += (b.openingBalance || 0);
      });
      wallets.forEach((w) => {
        const val = w.openingBalance ? (w.openingBalance / 100).toString() : '0';
        initialMap[`wallet_${w._id || w.id}`] = val;
        sum += (w.openingBalance || 0);
      });

      setAccountBalances(initialMap);
      if (sum > 0) {
        setOpeningBalance((sum / 100).toString());
      }
    }
  }, [isOpen, bankAccounts, wallets, months, currentMonth]);

  const handleMonthChange = (newMonth) => {
    setMonth(newMonth);
    setIncomeCreditDate(`${year}-${String(newMonth).padStart(2, '0')}-01`);
    updateDefaultsFromPredecessor(year, newMonth);
  };

  const handleYearChange = (newYear) => {
    setYear(newYear);
    setIncomeCreditDate(`${newYear}-${String(month).padStart(2, '0')}-01`);
    updateDefaultsFromPredecessor(newYear, month);
  };

  const handleAccountBalanceChange = (key, val) => {
    const updated = { ...accountBalances, [key]: val };
    setAccountBalances(updated);

    // Sum all composite balances into aggregate openingBalance
    const total = Object.values(updated).reduce((acc, curr) => {
      const num = parseFloat(curr) || 0;
      return acc + num;
    }, 0);
    setOpeningBalance(total.toFixed(2));
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (bankAccounts.length === 0) {
      if (!freshBankName.trim() || !freshBankInstitution.trim()) {
        alert('Please provide a name and financial institution for your primary bank account.');
        return;
      }

      const balInCents = freshBankBalance ? Math.round(Number(freshBankBalance) * 100) : (openingBalance ? Math.round(Number(openingBalance) * 100) : 0);
      onCreate({
        year: Number(year),
        month: Number(month),
        incomeCreditDate: incomeCreditDate || undefined,
        openingBalance: balInCents,
        incomeAmount: incomeAmount ? Math.round(Number(incomeAmount) * 100) : undefined,
        safetyFloor: safetyFloor ? Math.round(Number(safetyFloor) * 100) : undefined,
        isSalaryCredited,
        newBankAccount: {
          name: freshBankName.trim(),
          institution: freshBankInstitution.trim(),
          accountType: freshBankAccountType,
          openingBalance: balInCents,
          isPrimary: true,
          isSalaryDeposit: true
        }
      });
      return;
    }

    const compositeList = [];
    if (useCompositeBalances) {
      bankAccounts.forEach((b) => {
        const id = b._id || b.id;
        const val = parseFloat(accountBalances[`bank_${id}`]) || 0;
        compositeList.push({
          accountType: 'bank',
          accountId: id,
          amount: Math.round(val * 100)
        });
      });
      wallets.forEach((w) => {
        const id = w._id || w.id;
        const val = parseFloat(accountBalances[`wallet_${id}`]) || 0;
        compositeList.push({
          accountType: 'wallet',
          accountId: id,
          amount: Math.round(val * 100)
        });
      });
    }

    onCreate({
      year: Number(year),
      month: Number(month),
      incomeCreditDate: incomeCreditDate || undefined,
      openingBalance: openingBalance ? Math.round(Number(openingBalance) * 100) : 0,
      incomeAmount: incomeAmount ? Math.round(Number(incomeAmount) * 100) : undefined,
      safetyFloor: safetyFloor ? Math.round(Number(safetyFloor) * 100) : undefined,
      salaryBankAccountId: salaryBankAccountId || undefined,
      isSalaryCredited,
      accountOpeningBalances: compositeList.length > 0 ? compositeList : undefined
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Create budget month</h3>
          <button type="button" className="btn-icon" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Year</label>
              <input
                type="number"
                required
                value={year}
                onChange={(e) => handleYearChange(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Month</label>
              <select value={month} onChange={(e) => handleMonthChange(Number(e.target.value))}>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Salary credit date</label>
            <DatePicker
              value={incomeCreditDate}
              onChange={(d) => setIncomeCreditDate(d)}
              month={{ year, month }}
              required
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Supports preceding month-end (e.g. Sept 30 for Oct budget).
            </span>
          </div>

          {/* Fresh User: Embedded Primary Bank Account Setup */}
          {bankAccounts.length === 0 && (
            <div style={{ padding: '12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <BuildingLibraryIcon size={16} />
                <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Primary Bank Account Setup (Required)
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.4 }}>
                In this banking-grade planner, bank accounts and wallets are the sole source of truth for all balances. Every transaction, planned item, and salary deposit is linked to an account. Please register your primary account below to initialize your budget.
              </p>

              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label">Account Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Primary Checking, Salary Account"
                  value={freshBankName}
                  onChange={(e) => setFreshBankName(e.target.value)}
                />
              </div>

              <div className="form-row" style={{ marginBottom: '8px' }}>
                <div className="form-group">
                  <label className="form-label">Financial Institution *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank, Chase"
                    value={freshBankInstitution}
                    onChange={(e) => setFreshBankInstitution(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="fresh-bank-account-type">Account Type</label>
                  <CustomSelect
                    id="fresh-bank-account-type"
                    value={freshBankAccountType}
                    onChange={(e) => setFreshBankAccountType(e.target.value)}
                    options={[
                      { value: 'checking', label: 'Checking' },
                      { value: 'savings', label: 'Savings' },
                      { value: 'salary', label: 'Salary' },
                      { value: 'other', label: 'Other' }
                    ]}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Initial Opening Balance ({settings?.currencySymbol || '₹'}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="tabular-nums"
                  value={freshBankBalance}
                  onChange={(e) => {
                    setFreshBankBalance(e.target.value);
                    setOpeningBalance(e.target.value);
                  }}
                />
              </div>
            </div>
          )}

          {/* Salary Deposit Account Selector for users with existing accounts */}
          {bankAccounts.length > 0 && (
            <div className="form-group">
              <label className="form-label">
                <span>Salary Deposit Account</span> <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <select
                value={salaryBankAccountId}
                onChange={(e) => setSalaryBankAccountId(e.target.value)}
                required
              >
                {bankAccounts.map((b) => (
                  <option key={b._id || b.id} value={b._id || b.id}>
                    {b.name} {b.accountNumberMasked ? `(••${b.accountNumberMasked})` : ''} {b.isPrimary ? '[Primary]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Opening Balance with Composite Breakdown Toggle for users with accounts */}
          {bankAccounts.length > 0 && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0 }}>
                  Total Opening balance ({settings?.currencySymbol || '₹'})
                </label>
                {(bankAccounts.length > 0 || wallets.length > 0) && (
                  <button
                    type="button"
                    className="btn-subtle"
                    style={{ fontSize: '11px', padding: '2px 6px' }}
                    onClick={() => setUseCompositeBalances((prev) => !prev)}
                  >
                    {useCompositeBalances ? 'Aggregate input' : 'Break down by account'}
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={openingBalance}
                readOnly={useCompositeBalances}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="tabular-nums"
                style={{ fontWeight: 600 }}
              />
            </div>
          )}

          {/* Per-Account Opening Balances Breakdown */}
          {bankAccounts.length > 0 && useCompositeBalances && (
            <div style={{ padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Account-by-Account Opening Allocations
              </span>
              {bankAccounts.map((b) => {
                const id = b._id || b.id;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <BuildingLibraryIcon size={13} />
                      <span>{b.name}</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className="tabular-nums"
                      style={{ width: '120px', padding: '4px 8px', fontSize: '12px' }}
                      value={accountBalances[`bank_${id}`] || ''}
                      onChange={(e) => handleAccountBalanceChange(`bank_${id}`, e.target.value)}
                    />
                  </div>
                );
              })}
              {wallets.map((w) => {
                const id = w._id || w.id;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <WalletIcon size={13} />
                      <span>{w.name}</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className="tabular-nums"
                      style={{ width: '120px', padding: '4px 8px', fontSize: '12px' }}
                      value={accountBalances[`wallet_${id}`] || ''}
                      onChange={(e) => handleAccountBalanceChange(`wallet_${id}`, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Income ({settings?.currencySymbol || '₹'})</label>
              <input
                type="number"
                step="0.01"
                placeholder="Default from settings"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Safety floor ({settings?.currencySymbol || '₹'})</label>
              <input
                type="number"
                step="0.01"
                placeholder="Default from settings"
                value={safetyFloor}
                onChange={(e) => setSafetyFloor(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '8px' }}>
            <input
              id="create-month-salary-credited-checkbox"
              type="checkbox"
              checked={isSalaryCredited}
              onChange={(e) => setIsSalaryCredited(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="create-month-salary-credited-checkbox" style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', margin: 0 }}>
              Salary already credited for this month
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create month</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RolloverModal({
  isOpen,
  onClose,
  onConfirm,
  currentMonth,
  endingBalance = 0,
  currencySymbol = '₹',
  bankAccounts = [],
  wallets = [],
  simulation = null,
  items = []
}) {
  const [carryBalance, setCarryBalance] = useState(true);
  const [rolloverUnpaid, setRolloverUnpaid] = useState(true);

  if (!isOpen || !currentMonth) return null;

  const accountsMap = simulation?.accounts || {};
  const unpaidOneTimeItems = (items || []).filter((i) => i.type === 'one-time' && !i.isPaid);
  const unpaidSum = unpaidOneTimeItems.reduce((sum, i) => sum + (Math.round(i.amount || 0)), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Month rollover</h3>
          <button type="button" className="btn-icon" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
          Rollover copies all fixed recurring bills into the next calendar month so you don't have to re-enter them.
        </p>

        <div style={{ padding: '12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={carryBalance}
              onChange={(e) => setCarryBalance(e.target.checked)}
            />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Carry ending balance forward as opening balance ({formatCurrency(endingBalance, currencySymbol)})
            </span>
          </label>

          {/* Account breakdown preview */}
          {carryBalance && (bankAccounts.length > 0 || wallets.length > 0) && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Per-Account Ending Balances Carried:
              </span>
              {bankAccounts.map((b) => {
                const id = b._id || b.id;
                const endBal = accountsMap[id]?.endingBalance ?? b.openingBalance;
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BuildingLibraryIcon size={12} />
                      {b.name}
                    </span>
                    <strong className="tabular-nums">{formatCurrency(endBal, currencySymbol)}</strong>
                  </div>
                );
              })}
              {wallets.map((w) => {
                const id = w._id || w.id;
                const endBal = accountsMap[id]?.endingBalance ?? w.openingBalance;
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <WalletIcon size={12} />
                      {w.name}
                    </span>
                    <strong className="tabular-nums">{formatCurrency(endBal, currencySymbol)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Unpaid One-Time Items Rollover Prompt per ADR 0041 */}
        {unpaidOneTimeItems.length > 0 && (
          <div style={{ padding: '12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', marginTop: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto', marginTop: '2px' }}
                checked={rolloverUnpaid}
                onChange={(e) => setRolloverUnpaid(e.target.checked)}
              />
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'block' }}>
                  Roll forward unpaid one-time expenses ({unpaidOneTimeItems.length} items • {formatCurrency(unpaidSum, currencySymbol)})
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                  Automatically reschedules pending bills to the next month's best recommended dates.
                </span>
              </div>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(carryBalance, rolloverUnpaid)}
          >
            Confirm rollover
          </button>
        </div>
      </div>
    </div>
  );
}
