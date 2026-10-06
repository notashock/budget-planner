import React, { useState, useRef } from 'react';
import { BuildingLibraryIcon, ArrowRightLeftIcon, ShieldAlertIcon } from './Icons.jsx';
import { formatCurrency } from '@budget/engine';
import { AnimatedModal } from './AnimatedModal.jsx';
import { CustomSelect } from './CustomSelect.jsx';

export function TransferCalculationsModal({
  isOpen,
  onClose,
  migrationStats,
  month,
  items = [],
  bankAccounts = [],
  currencySymbol = '₹',
  onMigrate
}) {
  const [bankName, setBankName] = useState('Primary Checking');
  const [bankInstitution, setBankInstitution] = useState('');
  const [accountType, setAccountType] = useState('checking');
  const [selectedAccountId, setSelectedAccountId] = useState(
    bankAccounts[0]?._id || bankAccounts[0]?.id || ''
  );
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState(null);

  const openingBal = migrationStats?.currentOpeningBalance ?? month?.openingBalance ?? 0;
  const incomeBal = migrationStats?.currentIncomeAmount ?? month?.incomeAmount ?? 0;
  const plannedCount = migrationStats?.itemCount ?? items.length ?? 0;
  const txCount = migrationStats?.transactionCount ?? 0;

  const handleSubmit = async (e, requestClose) => {
    e.preventDefault();
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (bankAccounts.length === 0) {
        if (!bankName.trim() || !bankInstitution.trim()) {
          setError('Please provide an account name and financial institution.');
          loadingRef.current = false;
          setLoading(false);
          return;
        }
        await onMigrate({
          name: bankName.trim(),
          institution: bankInstitution.trim(),
          accountType,
          makePrimary: true,
          linkSalary: true
        });
      } else {
        const targetId = selectedAccountId || bankAccounts[0]?._id || bankAccounts[0]?.id;
        await onMigrate({
          existingBankAccountId: targetId
        });
      }
      if (typeof requestClose === 'function') {
        requestClose();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Data transfer failed. Please try again.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="500px"
      dataTestId="transfer-calculations-modal"
      style={{ padding: '24px' }}
    >
      {({ requestClose }) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ArrowRightLeftIcon size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Transfer Existing Calculations</h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Single unified migration to your bank ledger
                </p>
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={() => requestClose()}>✕</button>
          </div>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
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

        {/* Transfer Breakdown Preview */}
        <div style={{
          padding: '14px',
          borderRadius: 'var(--radius)',
          background: 'var(--surface-subtle)',
          border: '1px solid var(--border)',
          marginBottom: '16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Data to be Transferred
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ padding: '8px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Opening Balance</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }} className="tabular-nums">
                {formatCurrency(openingBal, currencySymbol)}
              </div>
            </div>
            <div style={{ padding: '8px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Monthly Salary</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }} className="tabular-nums">
                {formatCurrency(incomeBal, currencySymbol)}
              </div>
            </div>
            <div style={{ padding: '8px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Planned Items</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }} className="tabular-nums">
                {plannedCount} items
              </div>
            </div>
            <div style={{ padding: '8px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Transactions</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }} className="tabular-nums">
                {txCount} records
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => handleSubmit(e, requestClose)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {bankAccounts.length === 0 ? (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                No bank accounts linked yet. Enter your primary bank details below to create your account and absorb all existing calculations immediately.
              </div>

              <div>
                <label className="form-label" htmlFor="migration-bank-name">Bank Account Name *</label>
                <input
                  id="migration-bank-name"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Primary Checking, Salary Account"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" htmlFor="migration-bank-inst">Financial Institution *</label>
                  <input
                    id="migration-bank-inst"
                    type="text"
                    className="input-field"
                    placeholder="e.g. HDFC Bank, Chase"
                    value={bankInstitution}
                    onChange={(e) => setBankInstitution(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="migration-bank-type">Account Type</label>
                  <CustomSelect
                    id="migration-bank-type"
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    options={[
                      { value: 'checking', label: 'Checking' },
                      { value: 'savings', label: 'Savings' },
                      { value: 'salary', label: 'Salary' },
                      { value: 'other', label: 'Other' }
                    ]}
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="form-label" htmlFor="target-bank-account-select">
                Target Bank Account to Receive Calculations *
              </label>
              <select
                id="target-bank-account-select"
                className="input-field"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {bankAccounts.map((b) => (
                  <option key={b._id || b.id} value={b._id || b.id}>
                    {b.name} ({b.institution || 'Bank'}) {b.isPrimary ? '[Primary]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <BuildingLibraryIcon size={14} />
              <span>
                {loading
                  ? 'Transferring...'
                  : bankAccounts.length === 0
                  ? 'Create Account & Transfer All Data'
                  : 'Transfer All Calculations'}
              </span>
            </button>
          </div>
        </form>
      </>
    )}
  </AnimatedModal>
  );
}
