import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { DatePicker } from '../components/DatePicker.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';
import {
  BuildingLibraryIcon,
  WalletIcon,
  ArrowRightLeftIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  AlertTriangleIcon
} from '../components/Icons.jsx';

gsap.registerPlugin(useGSAP);

export function AccountsScreen({
  bankAccounts = [],
  wallets = [],
  transfers = [],
  simulation = null,
  currencySymbol = '₹',
  onSaveBankAccount,
  onSaveWallet,
  onArchiveBankAccount,
  onArchiveWallet,
  onCreateTransfer,
  onDeleteTransfer,
  isMigrationEligible = false,
  migrationStats = null,
  onMigrateLegacyData,
  month = null,
  onSaveMonthSettings,
  initialOpenBankModal = false,
  onResetBankModalTrigger
}) {
  const [activeSegment, setActiveSegment] = useState('banks'); // 'banks' | 'wallets' | 'transfers'
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [preselectedSource, setPreselectedSource] = useState(null);

  const switcherRef = useRef(null);
  const banksBtnRef = useRef(null);
  const walletsBtnRef = useRef(null);
  const transfersBtnRef = useRef(null);
  const tabIndicatorRef = useRef(null);
  const cardsContainerRef = useRef(null);

  useEffect(() => {
    if (initialOpenBankModal) {
      setActiveSegment('banks');
      setEditingBank(null);
      setBankName('');
      setBankInstitution('');
      setBankAccountType('checking');
      setBankNumberMasked('');
      setBankOpeningBalance('');
      setBankMinimumBalance('');
      setBankIsPrimary(bankAccounts.length === 0);
      setLinkLegacyData(false);
      setBankModalOpen(true);
      onResetBankModalTrigger?.();
    }
  }, [initialOpenBankModal]);

  // Form states for Bank Modal
  const [bankName, setBankName] = useState('');
  const [bankInstitution, setBankInstitution] = useState('');
  const [bankAccountType, setBankAccountType] = useState('checking');
  const [bankNumberMasked, setBankNumberMasked] = useState('');
  const [bankOpeningBalance, setBankOpeningBalance] = useState('');
  const [bankMinimumBalance, setBankMinimumBalance] = useState('');
  const [bankIsPrimary, setBankIsPrimary] = useState(false);
  const [linkLegacyData, setLinkLegacyData] = useState(false);

  // Form states for Wallet Modal
  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState('cash');
  const [walletOpeningBalance, setWalletOpeningBalance] = useState('');
  const [walletMinimumBalance, setWalletMinimumBalance] = useState('');
  const [walletIsPrimary, setWalletIsPrimary] = useState(false);

  // Form states for Transfer Modal
  const [transferDate, setTransferDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [transferAmount, setTransferAmount] = useState('');
  const [transferSourceType, setTransferSourceType] = useState('bank');
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestType, setTransferDestType] = useState('wallet');
  const [transferDestId, setTransferDestId] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState('');
  const [isSubmittingBank, setIsSubmittingBank] = useState(false);
  const isSubmittingBankRef = useRef(false);
  const [isSubmittingWallet, setIsSubmittingWallet] = useState(false);
  const isSubmittingWalletRef = useRef(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const isSubmittingTransferRef = useRef(false);

  // Month baseline settings state
  // Lookup maps from simulation
  const accountsMap = simulation?.accounts || {};

  // Totals
  const totalBankBalance = bankAccounts.reduce((sum, b) => {
    const key = String(b._id || b.id || '');
    const acc = accountsMap[key] || accountsMap[b._id || b.id];
    return sum + (acc ? acc.todayBalance : (b.openingBalance || 0));
  }, 0);

  const totalWalletBalance = wallets.reduce((sum, w) => {
    const key = String(w._id || w.id || '');
    const acc = accountsMap[key] || accountsMap[w._id || w.id];
    return sum + (acc ? acc.todayBalance : (w.openingBalance || 0));
  }, 0);

  const handleOpenAddBank = () => {
    setEditingBank(null);
    setBankName('');
    setBankInstitution('');
    setBankAccountType('checking');
    setBankNumberMasked('');
    setBankOpeningBalance('');
    setBankIsPrimary(bankAccounts.length === 0);
    setBankMinimumBalance('');
    setBankModalOpen(true);
  };

  const handleOpenEditBank = (bank) => {
    setEditingBank(bank);
    setBankName(bank.name || '');
    setBankInstitution(bank.institution || '');
    setBankAccountType(bank.accountType || 'checking');
    setBankNumberMasked(bank.accountNumberMasked || '');
    setBankOpeningBalance(bank.openingBalance !== undefined ? (bank.openingBalance / 100).toString() : '0');
    setBankMinimumBalance(bank.minimumBalance !== undefined ? (bank.minimumBalance / 100).toString() : '0');
    setBankIsPrimary(Boolean(bank.isPrimary));
    setBankModalOpen(true);
  };

  const handleSaveBank = async (e, requestClose) => {
    e.preventDefault();
    if (isSubmittingBankRef.current) return;
    if (!bankName.trim()) return;

    isSubmittingBankRef.current = true;
    setIsSubmittingBank(true);
    try {
      const cleanOpening = String(bankOpeningBalance || '').replace(/[^0-9.-]+/g, '');
      const cleanMin = String(bankMinimumBalance || '').replace(/[^0-9.-]+/g, '');

      await onSaveBankAccount?.({
        id: editingBank?._id || editingBank?.id,
        name: bankName.trim(),
        institution: bankInstitution.trim(),
        accountType: bankAccountType,
        accountNumberMasked: bankNumberMasked.trim(),
        openingBalance: Math.round(Number(cleanOpening || 0) * 100),
        minimumBalance: Math.round(Number(cleanMin || 0) * 100),
        isPrimary: bankIsPrimary
      });

      if (typeof requestClose === 'function') {
        requestClose();
      } else {
        setBankModalOpen(false);
      }
    } catch (err) {
      // Handled
    } finally {
      isSubmittingBankRef.current = false;
      setIsSubmittingBank(false);
    }
  };

  const handleOpenAddWallet = () => {
    setEditingWallet(null);
    setWalletName('');
    setWalletType('cash');
    setWalletOpeningBalance('');
    setWalletMinimumBalance('');
    setWalletIsPrimary(wallets.length === 0);
    setWalletModalOpen(true);
  };

  const handleOpenEditWallet = (wallet) => {
    setEditingWallet(wallet);
    setWalletName(wallet.name || '');
    setWalletType(wallet.walletType || 'cash');
    setWalletOpeningBalance(wallet.openingBalance !== undefined ? (wallet.openingBalance / 100).toString() : '0');
    setWalletMinimumBalance(wallet.minimumBalance !== undefined ? (wallet.minimumBalance / 100).toString() : '0');
    setWalletIsPrimary(Boolean(wallet.isPrimary));
    setWalletModalOpen(true);
  };

  const handleSaveWallet = async (e, requestClose) => {
    e.preventDefault();
    if (isSubmittingWalletRef.current) return;
    if (!walletName.trim()) return;

    isSubmittingWalletRef.current = true;
    setIsSubmittingWallet(true);
    try {
      const cleanOpening = String(walletOpeningBalance || '').replace(/[^0-9.-]+/g, '');
      const cleanMin = String(walletMinimumBalance || '').replace(/[^0-9.-]+/g, '');

      await onSaveWallet?.({
        id: editingWallet?._id || editingWallet?.id,
        name: walletName.trim(),
        walletType,
        openingBalance: Math.round(Number(cleanOpening || 0) * 100),
        minimumBalance: Math.round(Number(cleanMin || 0) * 100),
        isPrimary: walletIsPrimary
      });

      if (typeof requestClose === 'function') {
        requestClose();
      } else {
        setWalletModalOpen(false);
      }
    } catch (err) {
      // Handled
    } finally {
      isSubmittingWalletRef.current = false;
      setIsSubmittingWallet(false);
    }
  };

  const handleOpenTransfer = (sourceOpt = null) => {
    setTransferError('');
    setTransferAmount('');
    setTransferNote('');

    if (sourceOpt) {
      setTransferSourceType(sourceOpt.type);
      setTransferSourceId(sourceOpt.id);
      // Pick a default destination that differs
      if (sourceOpt.type === 'bank') {
        setTransferDestType('wallet');
        setTransferDestId(wallets[0]?._id || '');
      } else {
        setTransferDestType('bank');
        setTransferDestId(bankAccounts[0]?._id || '');
      }
    } else {
      setTransferSourceType('bank');
      setTransferSourceId(bankAccounts[0]?._id || '');
      setTransferDestType('wallet');
      setTransferDestId(wallets[0]?._id || '');
    }

    setTransferModalOpen(true);
  };

  const handleSaveTransfer = async (e, requestClose) => {
    e.preventDefault();
    if (isSubmittingTransferRef.current) return;
    setTransferError('');

    const amt = Math.round(Number(transferAmount || 0) * 100);
    if (!amt || amt <= 0) {
      setTransferError('Please enter a valid transfer amount');
      return;
    }

    if (transferSourceType === transferDestType && transferSourceId === transferDestId) {
      setTransferError('Source and destination accounts must be different');
      return;
    }

    if (!transferSourceId || !transferDestId) {
      setTransferError('Please select both source and destination accounts');
      return;
    }

    isSubmittingTransferRef.current = true;
    setIsSubmittingTransfer(true);
    try {
      await onCreateTransfer?.({
        date: transferDate,
        amount: amt,
        sourceType: transferSourceType,
        sourceBankAccountId: transferSourceType === 'bank' ? transferSourceId : null,
        sourceWalletId: transferSourceType === 'wallet' ? transferSourceId : null,
        destinationType: transferDestType,
        destinationBankAccountId: transferDestType === 'bank' ? transferDestId : null,
        destinationWalletId: transferDestType === 'wallet' ? transferDestId : null,
        note: transferNote.trim()
      });
      if (typeof requestClose === 'function') {
        requestClose();
      } else {
        setTransferModalOpen(false);
      }
    } catch (err) {
      setTransferError(err.message || 'Failed to record transfer');
    } finally {
      isSubmittingTransferRef.current = false;
      setIsSubmittingTransfer(false);
    }
  };

  const updateTabIndicator = (segment, immediate = false) => {
    let targetEl = null;
    if (segment === 'banks') targetEl = banksBtnRef.current;
    else if (segment === 'wallets') targetEl = walletsBtnRef.current;
    else if (segment === 'transfers') targetEl = transfersBtnRef.current;

    if (!targetEl || !tabIndicatorRef.current) return;
    const { offsetLeft, offsetWidth } = targetEl;
    if (immediate) {
      gsap.set(tabIndicatorRef.current, { x: offsetLeft, width: offsetWidth });
    } else {
      gsap.to(tabIndicatorRef.current, {
        x: offsetLeft,
        width: offsetWidth,
        duration: 0.22,
        ease: 'power2.out'
      });
    }
  };

  useGSAP(() => {
    updateTabIndicator(activeSegment);
  }, { dependencies: [activeSegment], scope: switcherRef });

  useGSAP(() => {
    if (cardsContainerRef.current) {
      const cards = cardsContainerRef.current.querySelectorAll('.account-card-anim');
      if (cards.length > 0) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, stagger: 0.04, duration: 0.24, ease: 'power2.out' }
        );
      }
    }
  }, { dependencies: [activeSegment, bankAccounts.length, wallets.length, transfers.length], scope: cardsContainerRef });

  return (
    <div className="screen-content">
      {/* Header and Quick Stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Accounts & Wallets</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Manage bank depositories, cash envelopes, and zero-sum inter-account transfers.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleOpenTransfer()}
            style={{ padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowRightLeftIcon size={14} />
            <span>Transfer Funds</span>
          </button>

          {activeSegment === 'banks' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenAddBank}
              style={{ padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusIcon size={14} />
              <span>Add Bank</span>
            </button>
          ) : activeSegment === 'wallets' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenAddWallet}
              style={{ padding: '7px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusIcon size={14} />
              <span>Add Wallet</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Legacy Migration Callout Banner */}
      {isMigrationEligible && (
        <div
          data-testid="migration-callout-banner"
          style={{
            marginTop: '16px',
            padding: '14px 18px',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <BuildingLibraryIcon size={18} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                Upgrade & Link Account
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                You have legacy balances and budget records ready to link into a designated primary bank account.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenAddBank}
            style={{ padding: '7px 14px', fontSize: '12px' }}
          >
            Link Primary Account
          </button>
        </div>
      )}

      {/* Aggregate Overview Cards */}
      <div className="summary-cards-grid" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div className="summary-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="summary-card-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BuildingLibraryIcon size={14} />
            <span>Bank Liquidity</span>
          </div>
          <div className="summary-card-value tabular-nums" style={{ fontSize: '22px', fontWeight: 700 }}>
            {formatCurrency(totalBankBalance, currencySymbol)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {bankAccounts.length} active {bankAccounts.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>

        <div className="summary-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="summary-card-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <WalletIcon size={14} />
            <span>Wallet Liquidity</span>
          </div>
          <div className="summary-card-value tabular-nums" style={{ fontSize: '22px', fontWeight: 700 }}>
            {formatCurrency(totalWalletBalance, currencySymbol)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {wallets.length} active {wallets.length === 1 ? 'wallet' : 'wallets'}
          </div>
        </div>

        <div className="summary-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="summary-card-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRightLeftIcon size={14} />
            <span>Transfers Logged</span>
          </div>
          <div className="summary-card-value tabular-nums" style={{ fontSize: '22px', fontWeight: 700 }}>
            {transfers.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Zero-sum movements
          </div>
        </div>
      </div>

      {/* Segmented Switcher */}
      <div className="timeline-filters-row" style={{ marginTop: '20px' }}>
        <div ref={switcherRef} className="modal-tab-track" style={{ width: '100%', maxWidth: '460px' }}>
          <div ref={tabIndicatorRef} className="modal-tab-indicator" />
          <button
            ref={banksBtnRef}
            type="button"
            className={`modal-tab-btn timeline-filter-btn ${activeSegment === 'banks' ? 'active' : ''}`}
            onClick={() => setActiveSegment('banks')}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <BuildingLibraryIcon size={14} />
            <span>Bank Accounts</span>
            <span className="filter-count tabular-nums">{bankAccounts.length}</span>
          </button>

          <button
            ref={walletsBtnRef}
            type="button"
            className={`modal-tab-btn timeline-filter-btn ${activeSegment === 'wallets' ? 'active' : ''}`}
            onClick={() => setActiveSegment('wallets')}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <WalletIcon size={14} />
            <span>Wallets</span>
            <span className="filter-count tabular-nums">{wallets.length}</span>
          </button>

          <button
            ref={transfersBtnRef}
            type="button"
            className={`modal-tab-btn timeline-filter-btn ${activeSegment === 'transfers' ? 'active' : ''}`}
            onClick={() => setActiveSegment('transfers')}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <ArrowRightLeftIcon size={14} />
            <span>Transfers</span>
            <span className="filter-count tabular-nums">{transfers.length}</span>
          </button>
        </div>
      </div>

      <div ref={cardsContainerRef}>
        {/* Segment 1: Bank Accounts */}
        {activeSegment === 'banks' && (
          <div style={{ marginTop: '16px' }}>
            {bankAccounts.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
                No bank accounts configured yet. Tap "Add Bank" to connect your checking, savings, or salary accounts.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                {bankAccounts.map((bank) => {
                  const key = String(bank._id || bank.id || '');
                  const simAcc = accountsMap[key] || accountsMap[bank._id || bank.id];
                  const currentBal = simAcc ? simAcc.todayBalance : (bank.openingBalance || 0);
                  const endingBal = simAcc ? simAcc.endingBalance : (bank.openingBalance || 0);
                  const lowestBal = simAcc ? simAcc.lowestBalance : (bank.openingBalance || 0);
                  const minBal = bank.minimumBalance || 0;
                  const hasBreach = simAcc ? simAcc.floorBreached : (currentBal < minBal);
                  const isSalaryDepository = Boolean(
                    month?.salaryBankAccountId &&
                    (String(month.salaryBankAccountId._id || month.salaryBankAccountId) === String(bank._id || bank.id))
                  );

                  return (
                    <div key={bank._id || bank.id} className={`bento-card account-card-anim ${hasBreach ? 'breached' : ''}`}>
                      {/* Tier 1: Identity & Badges */}
                      <div className="bento-card-header">
                        <div className="bento-card-identity">
                          <BuildingLibraryIcon size={16} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="bento-card-title">{bank.name}</span>
                              {bank.isPrimary && (
                                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--text)', color: 'var(--bg)', fontWeight: 700, textTransform: 'uppercase' }}>
                                  Primary
                                </span>
                              )}
                              {isSalaryDepository && (
                                <span
                                  data-testid="salary-depository-badge"
                                  style={{
                                    fontSize: '9px',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    background: 'var(--surface-subtle)',
                                    border: '1px solid var(--border-strong)',
                                    color: 'var(--text)',
                                    fontWeight: 600,
                                    textTransform: 'uppercase'
                                  }}
                                >
                                  Salary
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {bank.institution || 'Bank'} {bank.accountNumberMasked ? `• ${bank.accountNumberMasked}` : ''}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleOpenEditBank(bank)}
                            title="Edit Account"
                            style={{ padding: '5px' }}
                          >
                            <EditIcon size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => onArchiveBankAccount?.(bank._id || bank.id)}
                            title="Archive Account"
                            style={{ padding: '5px' }}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Tier 2: Hero Balance Metric */}
                      <div className="bento-hero-metric">
                        <span className="bento-hero-label">Current Balance</span>
                        <span className="bento-hero-value tabular-nums">
                          {formatCurrency(currentBal, currencySymbol)}
                        </span>
                      </div>

                      {/* High-Contrast Breach Indicator if breached */}
                      {hasBreach && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '4px', background: 'var(--text)', color: 'var(--bg)', fontSize: '11px', fontWeight: 600 }}>
                          <AlertTriangleIcon size={13} />
                          <span>{minBal > 0 ? `Projected to dip below min balance (${formatCurrency(minBal, currencySymbol)})` : `Overdrawn balance (${formatCurrency(currentBal, currencySymbol)})`}</span>
                        </div>
                      )}

                      {/* Tier 3: 2x2 Specs Grid */}
                      <div className="bento-spec-grid">
                        <div className="bento-spec-cell">
                          <span className="bento-spec-label">Projected End</span>
                          <span className="bento-spec-val tabular-nums">{formatCurrency(endingBal, currencySymbol)}</span>
                        </div>
                        <div className="bento-spec-cell">
                          <span className="bento-spec-label">Safety Floor</span>
                          <span className="bento-spec-val tabular-nums">{minBal > 0 ? formatCurrency(minBal, currencySymbol) : '₹0'}</span>
                        </div>
                        {isSalaryDepository && month?.incomeAmount > 0 && (
                          <div className="bento-spec-cell" style={{ gridColumn: '1 / -1' }}>
                            <span className="bento-spec-label">Payroll Inflow</span>
                            <span className="bento-spec-val tabular-nums" style={{ fontSize: '11px' }}>
                              +{formatCurrency(month.incomeAmount, currencySymbol)} on {month.incomeCreditDate ? formatDisplayDate(month.incomeCreditDate, true) : `Day ${month.incomeCreditDay || 1}`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="bento-actions-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleOpenTransfer({ type: 'bank', id: bank._id || bank.id })}
                          style={{ width: '100%', fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <ArrowRightLeftIcon size={13} />
                          <span>Transfer from Account</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Segment 2: Wallets */}
        {activeSegment === 'wallets' && (
          <div style={{ marginTop: '16px' }}>
            {wallets.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
                No wallets configured yet. Tap "Add Wallet" to track physical cash envelopes or digital wallets.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                {wallets.map((wallet) => {
                  const key = String(wallet._id || wallet.id || '');
                  const simAcc = accountsMap[key] || accountsMap[wallet._id || wallet.id];
                  const currentBal = simAcc ? simAcc.todayBalance : (wallet.openingBalance || 0);
                  const endingBal = simAcc ? simAcc.endingBalance : (wallet.openingBalance || 0);
                  const minBal = wallet.minimumBalance || 0;
                  const hasBreach = (currentBal < minBal) || (simAcc && simAcc.floorBreached);

                  return (
                    <div key={wallet._id || wallet.id} className={`bento-card account-card-anim ${hasBreach ? 'breached' : ''}`}>
                      {/* Tier 1: Identity & Badges */}
                      <div className="bento-card-header">
                        <div className="bento-card-identity">
                          <WalletIcon size={16} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="bento-card-title">{wallet.name}</span>
                              {wallet.isPrimary && (
                                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--text)', color: 'var(--bg)', fontWeight: 700, textTransform: 'uppercase' }}>
                                  Primary
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                              {wallet.walletType} Wallet
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleOpenEditWallet(wallet)}
                            title="Edit Wallet"
                            style={{ padding: '5px' }}
                          >
                            <EditIcon size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => onArchiveWallet?.(wallet._id || wallet.id)}
                            title="Archive Wallet"
                            style={{ padding: '5px' }}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Tier 2: Hero Balance Metric */}
                      <div className="bento-hero-metric">
                        <span className="bento-hero-label">Current Balance</span>
                        <span className="bento-hero-value tabular-nums">
                          {formatCurrency(currentBal, currencySymbol)}
                        </span>
                      </div>

                      {/* High-Contrast Breach Indicator if breached */}
                      {hasBreach && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '4px', background: 'var(--text)', color: 'var(--bg)', fontSize: '11px', fontWeight: 600 }}>
                          <AlertTriangleIcon size={13} />
                          <span>{minBal > 0 ? `Projected to dip below min balance (${formatCurrency(minBal, currencySymbol)})` : `Overdrawn balance (${formatCurrency(currentBal, currencySymbol)})`}</span>
                        </div>
                      )}

                      {/* Tier 3: 2x2 Specs Grid */}
                      <div className="bento-spec-grid">
                        <div className="bento-spec-cell">
                          <span className="bento-spec-label">Projected End</span>
                          <span className="bento-spec-val tabular-nums">{formatCurrency(endingBal, currencySymbol)}</span>
                        </div>
                        <div className="bento-spec-cell">
                          <span className="bento-spec-label">Safety Floor</span>
                          <span className="bento-spec-val tabular-nums">{minBal > 0 ? formatCurrency(minBal, currencySymbol) : '₹0'}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="bento-actions-row">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleOpenTransfer({ type: 'wallet', id: wallet._id || wallet.id })}
                          style={{ width: '100%', fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <ArrowRightLeftIcon size={13} />
                          <span>Transfer from Wallet</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* Segment 3: Transfers */}
      {activeSegment === 'transfers' && (
        <div style={{ marginTop: '16px' }}>
          {transfers.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
              No transfers recorded yet this month. Tap "Transfer Funds" above to reallocate money between accounts.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transfers.map((tr) => {
                const sBankId = tr.sourceBankAccountId?._id || tr.sourceBankAccountId;
                const sWalletId = tr.sourceWalletId?._id || tr.sourceWalletId;
                const sBank = bankAccounts.find((b) => (b._id || b.id) === sBankId) || (typeof tr.sourceBankAccountId === 'object' ? tr.sourceBankAccountId : null);
                const sWallet = wallets.find((w) => (w._id || w.id) === sWalletId) || (typeof tr.sourceWalletId === 'object' ? tr.sourceWalletId : null);
                const sourceName = sBank?.name || sWallet?.name || 'Source Account';

                const dBankId = tr.destinationBankAccountId?._id || tr.destinationBankAccountId;
                const dWalletId = tr.destinationWalletId?._id || tr.destinationWalletId;
                const dBank = bankAccounts.find((b) => (b._id || b.id) === dBankId) || (typeof tr.destinationBankAccountId === 'object' ? tr.destinationBankAccountId : null);
                const dWallet = wallets.find((w) => (w._id || w.id) === dWalletId) || (typeof tr.destinationWalletId === 'object' ? tr.destinationWalletId : null);
                const destName = dBank?.name || dWallet?.name || 'Destination Account';

                return (
                  <div key={tr._id || tr.id} className="card account-card-anim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ padding: '8px', borderRadius: '50%', background: 'var(--card-hover)', color: 'var(--text)' }}>
                        <ArrowRightLeftIcon size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{sourceName}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>➔</span>
                          <span>{destName}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          <span className="tabular-nums">{formatDisplayDate(tr.date, true)}</span>
                          {tr.note ? ` • ${tr.note}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 700 }}>
                        {formatCurrency(tr.amount, currencySymbol)}
                      </div>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => onDeleteTransfer?.(tr._id || tr.id)}
                        title="Delete Transfer"
                        style={{ padding: '6px' }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>

      {/* Modal: Add/Edit Bank Account */}
      <AnimatedModal
        isOpen={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        maxWidth="440px"
        dataTestId="bank-account-modal"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        {({ requestClose }) => (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>{editingBank ? 'Edit Bank Account' : 'Add Bank Account'}</h3>
              <button type="button" className="btn-icon" onClick={() => requestClose()}>✕</button>
            </div>

            <form onSubmit={(e) => handleSaveBank(e, requestClose)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label" htmlFor="bank-name-input">Account Name *</label>
                <input
                  id="bank-name-input"
                  type="text"
                  className="input-field"
                  placeholder="e.g. HDFC Salary, Chase Checking"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="bank-inst-input">Financial Institution</label>
                <input
                  id="bank-inst-input"
                  type="text"
                  className="input-field"
                  placeholder="e.g. HDFC Bank, Chase, SBI"
                  value={bankInstitution}
                  onChange={(e) => setBankInstitution(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" htmlFor="bank-type-select">Account Type</label>
                  <CustomSelect
                    id="bank-type-select"
                    value={bankAccountType}
                    onChange={(e) => setBankAccountType(e.target.value)}
                    options={[
                      { value: 'checking', label: 'Checking' },
                      { value: 'savings', label: 'Savings' },
                      { value: 'salary', label: 'Salary' },
                      { value: 'other', label: 'Other' }
                    ]}
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="bank-number-input">Masked Number</label>
                  <input
                    id="bank-number-input"
                    type="text"
                    className="input-field"
                    placeholder="e.g. •••• 4021"
                    value={bankNumberMasked}
                    onChange={(e) => setBankNumberMasked(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" htmlFor="bankOpeningBalance">
                    Opening Balance ({currencySymbol})
                  </label>
                  <input
                    id="bankOpeningBalance"
                    type="number"
                    step="0.01"
                    className="input-field tabular-nums"
                    placeholder="0.00"
                    value={bankOpeningBalance}
                    onChange={(e) => setBankOpeningBalance(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="bank-min-balance-input">Min Balance ({currencySymbol})</label>
                  <input
                    id="bank-min-balance-input"
                    type="number"
                    step="0.01"
                    className="input-field tabular-nums"
                    placeholder="0.00"
                    value={bankMinimumBalance}
                    onChange={(e) => setBankMinimumBalance(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="bankIsPrimary"
                  checked={bankIsPrimary}
                  onChange={(e) => setBankIsPrimary(e.target.checked)}
                />
                <label htmlFor="bankIsPrimary" style={{ fontSize: '13px', cursor: 'pointer' }}>
                  Set as primary bank account (pre-selected in entries)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => requestClose()}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmittingBank}>
                  {isSubmittingBank ? 'Saving...' : (editingBank ? 'Save Changes' : 'Create Account')}
                </button>
              </div>
            </form>
          </>
        )}
      </AnimatedModal>

      {/* Modal: Add/Edit Wallet */}
      <AnimatedModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        maxWidth="400px"
        dataTestId="wallet-modal"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        {({ requestClose }) => (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>{editingWallet ? 'Edit Wallet' : 'Add Wallet'}</h3>
              <button type="button" className="btn-icon" onClick={() => requestClose()}>✕</button>
            </div>

            <form onSubmit={(e) => handleSaveWallet(e, requestClose)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">Wallet Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Physical Cash, Paytm Wallet"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">Wallet Type</label>
                <CustomSelect
                  value={walletType}
                  onChange={(e) => setWalletType(e.target.value)}
                  options={[
                    { value: 'cash', label: 'Cash Envelope' },
                    { value: 'digital', label: 'Digital Wallet' },
                    { value: 'other', label: 'Other' }
                  ]}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" htmlFor="walletOpeningBalance">Opening Balance ({currencySymbol})</label>
                  <input
                    id="walletOpeningBalance"
                    type="number"
                    step="0.01"
                    className="input-field tabular-nums"
                    placeholder="0.00"
                    value={walletOpeningBalance}
                    onChange={(e) => setWalletOpeningBalance(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="wallet-min-balance-input">Min Balance ({currencySymbol})</label>
                  <input
                    id="wallet-min-balance-input"
                    type="number"
                    step="0.01"
                    className="input-field tabular-nums"
                    placeholder="0.00"
                    value={walletMinimumBalance}
                    onChange={(e) => setWalletMinimumBalance(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="walletIsPrimary"
                  checked={walletIsPrimary}
                  onChange={(e) => setWalletIsPrimary(e.target.checked)}
                />
                <label htmlFor="walletIsPrimary" style={{ fontSize: '13px', cursor: 'pointer' }}>
                  Set as primary wallet (pre-selected in entries)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => requestClose()}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmittingWallet}>
                  {isSubmittingWallet ? 'Saving...' : (editingWallet ? 'Save Changes' : 'Create Wallet')}
                </button>
              </div>
            </form>
          </>
        )}
      </AnimatedModal>

      {/* Modal: Transfer Funds */}
      <AnimatedModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        maxWidth="440px"
        dataTestId="transfer-modal"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        {({ requestClose }) => (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowRightLeftIcon size={18} />
                <h3 style={{ margin: 0 }}>Paired Account Transfer</h3>
              </div>
              <button type="button" className="btn-icon" onClick={() => requestClose()}>✕</button>
            </div>

            {transferError && (
              <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--text)', color: 'var(--bg)', fontSize: '12px', marginBottom: '12px', fontWeight: 600 }}>
                {transferError}
              </div>
            )}

            <form onSubmit={(e) => handleSaveTransfer(e, requestClose)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label">Transfer Date *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Amount ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input-field tabular-nums"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Source Account Picker */}
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-hover)' }}>
                <label className="form-label" style={{ marginBottom: '6px' }}>Source Account (Outflow) *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px' }}>
                  <select
                    className="input-field"
                    value={transferSourceType}
                    onChange={(e) => {
                      setTransferSourceType(e.target.value);
                      if (e.target.value === 'bank') {
                        setTransferSourceId(bankAccounts[0]?._id || '');
                      } else {
                        setTransferSourceId(wallets[0]?._id || '');
                      }
                    }}
                  >
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                  </select>

                  <select
                    className="input-field"
                    value={transferSourceId}
                    onChange={(e) => setTransferSourceId(e.target.value)}
                    required
                  >
                    {transferSourceType === 'bank' ? (
                      bankAccounts.map((b) => (
                        <option key={b._id || b.id} value={b._id || b.id}>
                          {b.name} ({formatCurrency(accountsMap[b._id || b.id]?.todayBalance ?? b.openingBalance, currencySymbol)})
                        </option>
                      ))
                    ) : (
                      wallets.map((w) => (
                        <option key={w._id || w.id} value={w._id || w.id}>
                          {w.name} ({formatCurrency(accountsMap[w._id || w.id]?.todayBalance ?? w.openingBalance, currencySymbol)})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Destination Account Picker */}
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-hover)' }}>
                <label className="form-label" style={{ marginBottom: '6px' }}>Destination Account (Inflow) *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px' }}>
                  <select
                    className="input-field"
                    value={transferDestType}
                    onChange={(e) => {
                      setTransferDestType(e.target.value);
                      if (e.target.value === 'bank') {
                        setTransferDestId(bankAccounts[0]?._id || '');
                      } else {
                        setTransferDestId(wallets[0]?._id || '');
                      }
                    }}
                  >
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                  </select>

                  <select
                    className="input-field"
                    value={transferDestId}
                    onChange={(e) => setTransferDestId(e.target.value)}
                    required
                  >
                    {transferDestType === 'bank' ? (
                      bankAccounts.map((b) => (
                        <option key={b._id || b.id} value={b._id || b.id}>
                          {b.name} ({formatCurrency(accountsMap[b._id || b.id]?.todayBalance ?? b.openingBalance, currencySymbol)})
                        </option>
                      ))
                    ) : (
                      wallets.map((w) => (
                        <option key={w._id || w.id} value={w._id || w.id}>
                          {w.name} ({formatCurrency(accountsMap[w._id || w.id]?.todayBalance ?? w.openingBalance, currencySymbol)})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Note / Reference</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. ATM withdrawal, savings deposit"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                * Paired transfers are zero-sum on your monthly budget curve ($0 net change to total liquid cash).
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn-secondary" onClick={() => requestClose()}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmittingTransfer}>
                  {isSubmittingTransfer ? 'Recording...' : 'Record Transfer'}
                </button>
              </div>
            </form>
          </>
        )}
      </AnimatedModal>
    </div>
  );
}
