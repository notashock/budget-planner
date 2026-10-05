import React, { useState, useEffect, useMemo } from 'react';
import { BuildingLibraryIcon, ShieldAlertIcon, LockIcon } from './Icons.jsx';
import { formatCurrency, getSalaryWindowStatus } from '@budget/engine';
import { AnimatedModal } from './AnimatedModal.jsx';

export function SalarySafelineModal({
  isOpen,
  onClose,
  month,
  bankAccounts = [],
  currencySymbol = '₹',
  onSave
}) {
  const [salaryBankAccountId, setSalaryBankAccountId] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [salaryCreditedDate, setSalaryCreditedDate] = useState('');
  const [isSalaryCredited, setIsSalaryCredited] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && month) {
      const activeBankId = month.salaryBankAccountId?._id || month.salaryBankAccountId || '';
      const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
      setSalaryBankAccountId(activeBankId || primaryBank?._id || primaryBank?.id || '');
      setIncomeAmount(month.incomeAmount ? (month.incomeAmount / 100).toString() : '0');
      const defaultDate = month.salaryCreditedDate || month.incomeCreditDate || (
        `${month.year}-${String(month.month).padStart(2, '0')}-${String(Math.max(1, Math.min(31, month.incomeCreditDay || 1))).padStart(2, '0')}`
      );
      setSalaryCreditedDate(defaultDate);
      setIsSalaryCredited(month.isSalaryCredited !== undefined ? Boolean(month.isSalaryCredited) : true);
      setError(null);
    }
  }, [isOpen, month, bankAccounts]);

  const salaryLockStatus = useMemo(() => {
    return month ? getSalaryWindowStatus(month) : { isLocked: false };
  }, [month]);

  if (!month) return null;

  const maxDate = month ? (() => {
    const lastD = new Date(month.year, month.month, 0).getDate();
    return `${month.year}-${String(month.month).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  })() : undefined;

  const handleSubmit = async (e, requestClose) => {
    e.preventDefault();
    if (salaryLockStatus.isLocked) {
      setError(salaryLockStatus.reason || 'Salary logging is currently locked.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const parsedIncome = Math.round(Number(incomeAmount || 0) * 100);

      await onSave({
        salaryBankAccountId: salaryBankAccountId || null,
        incomeAmount: parsedIncome,
        salaryCreditedDate: salaryCreditedDate || null,
        incomeCreditDate: salaryCreditedDate || null,
        isSalaryCredited
      });
      if (typeof requestClose === 'function') {
        requestClose();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to update salary details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="440px"
      dataTestId="salary-safeline-modal"
      style={{ padding: '24px' }}
    >
      {({ requestClose }) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BuildingLibraryIcon size={18} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                Log Salary
              </h3>
            </div>
            <button type="button" className="btn-icon" onClick={() => requestClose()}>✕</button>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Designate the bank account that receives your salary and specify the monthly salary details for {month.month}/{month.year}.
          </p>

        {salaryLockStatus.isLocked && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              fontSize: '12px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-secondary)'
            }}
            data-testid="salary-lock-banner"
          >
            <LockIcon size={14} />
            <span><strong>Salary logging locked:</strong> {salaryLockStatus.reason}</span>
          </div>
        )}

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border)',
            fontSize: '12px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlertIcon size={14} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, requestClose)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Salary Credited Bank Account */}
          <div>
            <label className="form-label" htmlFor="salary-credited-bank-select">
              Salary Credited Account *
            </label>
            {bankAccounts.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)' }}>
                No bank accounts registered yet. Please create a bank account first.
              </div>
            ) : (
              <select
                id="salary-credited-bank-select"
                className="input-field"
                value={salaryBankAccountId}
                onChange={(e) => setSalaryBankAccountId(e.target.value)}
                required
              >
                {bankAccounts.map((b) => (
                  <option key={b._id || b.id} value={b._id || b.id}>
                    {b.name} ({b.institution || 'Bank'}) {b.isPrimary ? '[Primary]' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Monthly Salary Amount */}
          <div>
            <label className="form-label" htmlFor="salary-amount-input">
              Monthly Salary Amount ({currencySymbol}) *
            </label>
            <input
              id="salary-amount-input"
              type="number"
              step="0.01"
              required
              className="input-field tabular-nums"
              placeholder="0.00"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
            />
          </div>

          {/* Date of Salary Credit */}
          <div>
            <label className="form-label" htmlFor="salary-credit-date-input">
              Date of Salary Credit *
            </label>
            <input
              id="salary-credit-date-input"
              type="date"
              max={maxDate}
              required
              className="input-field tabular-nums"
              value={salaryCreditedDate}
              onChange={(e) => {
                setSalaryCreditedDate(e.target.value);
                if (e.target.value) setIsSalaryCredited(true);
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              The exact calendar date your salary is credited (can also be on previous month-end).
            </span>
          </div>

          {/* Salary already credited checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <input
              id="salary-credited-checkbox"
              type="checkbox"
              checked={isSalaryCredited}
              onChange={(e) => setIsSalaryCredited(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="salary-credited-checkbox" style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', margin: 0 }}>
              Salary already credited for this month
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn-subtle"
              onClick={() => requestClose()}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || bankAccounts.length === 0 || salaryLockStatus.isLocked}
            >
              {loading ? 'Saving...' : 'Log Salary'}
            </button>
          </div>
        </form>
      </>
    )}
  </AnimatedModal>
  );
}

