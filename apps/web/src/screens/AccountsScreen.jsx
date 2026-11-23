import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { playEntrance } from '../components/entranceMotion.js';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { DatePicker } from '../components/DatePicker.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';
import {
  BuildingLibraryIcon,
  WalletIcon,
  ArrowRightLeftIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  AlertTriangleIcon,
  XIcon,
  EyeIcon, ArrowRightIcon
} from '../components/Icons.jsx';
import { Chip } from '../components/ui/Chip.jsx';
import { ConcentricActivityRings } from '../components/ConcentricActivityRings.jsx';
import { PeoplePanel } from '../components/PeoplePanel.jsx';
import { CardsPanel } from '../components/CardsPanel.jsx';
import { liveBalance } from '../utils/liveBalance.js';

gsap.registerPlugin(useGSAP);


export function AccountsScreen({
  bankAccounts = [],
  transactions = [],
  wallets = [],
  transfers = [],
  simulation = null,
  currencySymbol = '₹',
  onSaveBankAccount,
  onSaveWallet,
  onArchiveBankAccount,
  onArchiveWallet,
  onCreateTransfer,
  // Opens the entry sheet: ('transfer', { sourceAccountId }) for the Move tab
  onOpenUnifiedEntry,
  onDeleteTransfer,
  isMigrationEligible = false,
  migrationStats = null,
  onMigrateLegacyData,
  month = null,
  isReviewMode = false,
  onSaveMonthSettings,
  initialOpenBankModal = false,
  onResetBankModalTrigger,
  onHeldLentChanged,
  creditCards = []
}) {
  const [activeSegment, setActiveSegment] = useState('banks'); // 'banks' | 'wallets' | 'transfers'
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
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
  const [isSubmittingBank, setIsSubmittingBank] = useState(false);
  // Save errors shown inside the bank / wallet forms (instead of alert())
  const [bankError, setBankError] = useState('');
  const [walletError, setWalletError] = useState('');
  const isSubmittingBankRef = useRef(false);
  const [isSubmittingWallet, setIsSubmittingWallet] = useState(false);
  const isSubmittingWalletRef = useRef(false);

  // Month baseline settings state
  // Lookup maps from simulation
  const accountsMap = simulation?.accounts || {};

  // Totals
  const totalBankBalance = bankAccounts.reduce((sum, b) => {
    const key = String(b._id || b.id || '');
    const acc = accountsMap[key] || accountsMap[b._id || b.id];
    return sum + liveBalance(b, acc, month);
  }, 0);

  const totalWalletBalance = wallets.reduce((sum, w) => {
    const key = String(w._id || w.id || '');
    const acc = accountsMap[key] || accountsMap[w._id || w.id];
    return sum + liveBalance(w, acc, month);
  }, 0);

  const totalPortfolioBalance = totalBankBalance + totalWalletBalance;

  // Editing an opening balance rewrites every balance since the account was added
  const openingShift = (account, typedValue) => {
    if (!account) return 0;
    const typed = Math.round(Number(String(typedValue || '').replace(/[^0-9.-]+/g, '') || 0) * 100);
    return typed - Math.round(Number(account.openingBalance) || 0);
  };
  const historyWarning = (account, typedValue) => {
    const shift = openingShift(account, typedValue);
    if (!shift) return null;
    return (
      <p className="history-warning" role="note" data-testid="opening-balance-warning">
        Changing this shifts every balance since {account.name || 'this account'} was added by{' '}
        <strong className="tabular-nums">{shift > 0 ? '+' : '−'}{formatCurrency(Math.abs(shift), currencySymbol)}</strong>.
      </p>
    );
  };

  const handleOpenAddBank = () => {
    setBankError('');
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
    setBankError('');
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
      setBankError(err?.message || 'Could not save this account. Please try again.');
    } finally {
      isSubmittingBankRef.current = false;
      setIsSubmittingBank(false);
    }
  };

  const handleOpenAddWallet = () => {
    setWalletError('');
    setEditingWallet(null);
    setWalletName('');
    setWalletType('cash');
    setWalletOpeningBalance('');
    setWalletMinimumBalance('');
    setWalletIsPrimary(wallets.length === 0);
    setWalletModalOpen(true);
  };

  const handleOpenEditWallet = (wallet) => {
    setWalletError('');
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
      setWalletError(err?.message || 'Could not save this wallet. Please try again.');
    } finally {
      isSubmittingWalletRef.current = false;
      setIsSubmittingWallet(false);
    }
  };

  // Transfers use the entry sheet's Move tab (one transfer form for the whole app)
  const handleOpenTransfer = (sourceOpt = null) => {
    onOpenUnifiedEntry?.('transfer', sourceOpt ? { sourceAccountId: sourceOpt.id } : null);
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
    if (!cardsContainerRef.current) return undefined;
    return playEntrance(cardsContainerRef.current.querySelectorAll('.account-card-anim'), { y: 12, duration: 0.24 });
  }, { dependencies: [activeSegment, bankAccounts.length, wallets.length, transfers.length], scope: cardsContainerRef });

  return (
    <div className="screen-content">
      <ScreenHeader title="Accounts" />

      {/* Header and Quick Stats */}
      <div className="accounts-header-minimal">
        <div>
          <div className="accounts-note">
            Total across accounts
          </div>
          <div className="accounts-hero-total tabular-nums">
            {formatCurrency(totalPortfolioBalance, currencySymbol)}
          </div>
        </div>

        <div className="accounts-row">
          {isReviewMode ? (
            <span className="review-badge-tag accounts-row-2">
              <EyeIcon size={13} /> Month-end balances
            </span>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary accounts-btn"
                onClick={() => handleOpenTransfer()}
                aria-label="Transfer Funds"
              >
                <ArrowRightLeftIcon size={14} />
                <span>Transfer Funds</span>
              </button>

              {activeSegment === 'banks' ? (
                <button
                  type="button"
                  className="btn-primary accounts-btn"
                  onClick={handleOpenAddBank}
                >
                  <PlusIcon size={14} />
                  <span>Add Bank</span>
                </button>
              ) : activeSegment === 'wallets' ? (
                <button
                  type="button"
                  className="btn-primary accounts-btn"
                  onClick={handleOpenAddWallet}
                >
                  <PlusIcon size={14} />
                  <span>Add Wallet</span>
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Legacy Migration Callout Banner */}
      {isMigrationEligible && (
        <div className="accounts-row-3"
          data-testid="migration-callout-banner"
        >
          <div className="accounts-row-4">
            <div className="accounts-row-5"
            >
              <BuildingLibraryIcon size={18} />
            </div>
            <div>
              <div className="accounts-text">
                Upgrade & Link Account
              </div>
              <div className="accounts-note-2">
                You have legacy balances and budget records ready to link into a designated primary bank account.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary accounts-btn-2"
            onClick={handleOpenAddBank}
          >
            Link Primary Account
          </button>
        </div>
      )}

      {/* Laptop / Desktop Horizontal Split Layout */}
      <div className="accounts-laptop-split">
        {/* Left Section: Interactive Concentric Activity Rings Telemetry */}
        <ConcentricActivityRings
          totalBankBalance={totalBankBalance}
          totalWalletBalance={totalWalletBalance}
          transfersCount={transfers.length}
          activeSegment={activeSegment}
          onSelectSegment={setActiveSegment}
          currencySymbol={currencySymbol}
        />

        {/* Right Section: Responsive Cards Grid */}
        <div ref={cardsContainerRef}>
          {/* Segment 1: Bank Accounts */}
          {activeSegment === 'banks' && (
            <div>
              {bankAccounts.length === 0 ? (
                <div className="apple-empty-card">
                  <BuildingLibraryIcon size={32} style={{ opacity: 0.5, color: 'var(--text-secondary)' }} />
                  <button
                    type="button"
                    className="btn-primary accounts-btn-3"
                    onClick={handleOpenAddBank}
                  >
                    + Create Depository
                  </button>
                </div>
              ) : (
                <div className="apple-cards-grid">
                  {bankAccounts.map((bank) => {
                    const key = String(bank._id || bank.id || '');
                    const simAcc = accountsMap[key] || accountsMap[bank._id || bank.id];
                    const bankId = bank._id || bank.id;
                    const snap = isReviewMode && month?.closingBalances ? month.closingBalances[bankId] : null;
                    const currentBal = liveBalance(bank, simAcc, month);
                    const endingBal = simAcc ? simAcc.endingBalance : (bank.openingBalance || 0);
                    const minBal = bank.minimumBalance || 0;
                    const hasBreach = !isReviewMode && (simAcc ? simAcc.floorBreached : (currentBal < minBal));
                    const isSalaryDepository = Boolean(
                      month?.salaryBankAccountId &&
                      (String(month.salaryBankAccountId._id || month.salaryBankAccountId) === String(bank._id || bank.id))
                    );

                    return (
                      <div key={bank._id || bank.id} className={`apple-account-card account-card-anim ${hasBreach ? 'breached' : ''}`}>
                        {/* Top Row: Identity */}
                        <div className="apple-card-top">
                          <div className="apple-card-identity">
                            <div className="apple-card-icon-box bank">
                              <BuildingLibraryIcon size={16} />
                            </div>
                            <div>
                              <div className="accounts-row-6">
                                <span className="bento-card-title">{bank.name}</span>
                                {bank.isPrimary && (
                                  <span className="accounts-note-3">
                                    Primary
                                  </span>
                                )}
                                {isSalaryDepository && (
                                  <span className="accounts-note-4"
                                    data-testid="salary-depository-badge"
                                  >
                                    Salary
                                  </span>
                                )}
                                {isReviewMode && (
                                  <span className="review-badge-tag accounts-note-5">
                                    Closed Scorecard
                                  </span>
                                )}
                              </div>
                              <div className="accounts-note-6">
                                {bank.institution || 'Bank'} {bank.accountNumberMasked ? `• •••• ${bank.accountNumberMasked.slice(-4)}` : ''}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Hero Metric Row: Balance on left, Projected end on right */}
                        <div className="apple-card-hero-row">
                          <div>
                            {isReviewMode && (
                              <div className="accounts-note-7">
                                Closing Balance (Snapshotted)
                              </div>
                            )}
                            <div className="apple-card-balance tabular-nums">
                              {formatCurrency(snap ? snap.closingBalance : currentBal, currencySymbol)}
                            </div>
                          </div>
                          {!isReviewMode && (
                            <div className="apple-card-projected tabular-nums">
                              Projected end <strong>{formatCurrency(endingBal, currencySymbol)}</strong>
                            </div>
                          )}
                        </div>

                        {/* Snapshotted 2x2 Specs Grid in Review Mode */}
                        {snap && (
                          <div className="accounts-grid">
                            <div>
                              <span className="accounts-note-8">Opening Balance</span>
                              <span className="tabular-nums accounts-note-9">{formatCurrency(snap.openingBalance, currencySymbol)}</span>
                            </div>
                            <div>
                              <span className="accounts-note-8">Total Inflow</span>
                              <span className="tabular-nums accounts-note-10">
                                +{formatCurrency(snap.totalInflow, currencySymbol)}
                              </span>
                            </div>
                            <div>
                              <span className="accounts-note-8">Total Outflow</span>
                              <span className="tabular-nums accounts-note-9">-{formatCurrency(snap.totalOutflow, currencySymbol)}</span>
                            </div>
                            <div>
                              <span className="accounts-note-8">Net Movement</span>
                              <span className="tabular-nums accounts-note-11">
                                {formatCurrency(snap.totalInflow - snap.totalOutflow, currencySymbol)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* High-Contrast Breach Indicator if breached */}
                        {hasBreach && (
                          <div className="accounts-row-7">
                            <AlertTriangleIcon size={13} />
                            <span>{minBal > 0 ? `Projected to dip below min balance (${formatCurrency(minBal, currencySymbol)})` : `Overdrawn balance (${formatCurrency(currentBal, currencySymbol)})`}</span>
                          </div>
                        )}

                        {/* Bottom Row: Status on Bottom Left, Action Buttons on Bottom Right */}
                        <div className="apple-card-footer">
                          <span className={`apple-status-chip ${hasBreach ? 'breached' : 'healthy'}`}>
                            <span className="apple-status-dot" />
                            <span>{hasBreach ? 'Breached' : 'Healthy'}</span>
                          </span>

                          {!isReviewMode && (
                            <div className="apple-card-actions">
                              <button
                                type="button"
                                className="btn-icon accounts-btn-4"
                                onClick={() => handleOpenTransfer({ type: 'bank', id: bank._id || bank.id })}
                                title="Transfer Funds"
                                aria-label="Transfer from Account"
                              >
                                <ArrowRightLeftIcon size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon accounts-btn-4"
                                onClick={() => handleOpenEditBank(bank)}
                                title="Edit Account"
                              >
                                <EditIcon size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon accounts-btn-4"
                                onClick={() => onArchiveBankAccount?.(bank._id || bank.id)}
                                title="Archive Account"
                              >
                                <TrashIcon size={13} />
                              </button>
                            </div>
                          )}
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
            <div>
              {wallets.length === 0 ? (
                <div className="apple-empty-card">
                  <WalletIcon size={32} style={{ opacity: 0.5, color: 'var(--text-secondary)' }} />
                  <button
                    type="button"
                    className="btn-primary accounts-btn-3"
                    onClick={handleOpenAddWallet}
                  >
                    + Create Wallet
                  </button>
                </div>
              ) : (
                <div className="apple-cards-grid">
                  {wallets.map((wallet) => {
                    const key = String(wallet._id || wallet.id || '');
                    const simAcc = accountsMap[key] || accountsMap[wallet._id || wallet.id];
                    const walletId = wallet._id || wallet.id;
                    const snap = isReviewMode && month?.closingBalances ? month.closingBalances[walletId] : null;
                    const currentBal = liveBalance(wallet, simAcc, month);
                    const endingBal = simAcc ? simAcc.endingBalance : (wallet.openingBalance || 0);
                    const minBal = wallet.minimumBalance || 0;
                    const hasBreach = !isReviewMode && ((currentBal < minBal) || (simAcc && simAcc.floorBreached));

                    return (
                      <div key={wallet._id || wallet.id} className={`apple-account-card account-card-anim ${hasBreach ? 'breached' : ''}`}>
                        {/* Top Row: Identity */}
                        <div className="apple-card-top">
                          <div className="apple-card-identity">
                            <div className="apple-card-icon-box wallet">
                              <WalletIcon size={16} />
                            </div>
                            <div>
                              <div className="accounts-row-6">
                                <span className="bento-card-title">{wallet.name}</span>
                                {wallet.isPrimary && (
                                  <span className="accounts-note-3">
                                    Primary
                                  </span>
                                )}
                                {isReviewMode && (
                                  <span className="review-badge-tag accounts-note-5">
                                    Closed Scorecard
                                  </span>
                                )}
                              </div>
                              <div className="accounts-note-12">
                                {wallet.walletType} Wallet
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Hero Metric Row: Balance on left, Projected end on right */}
                        <div className="apple-card-hero-row">
                          <div>
                            {isReviewMode && (
                              <div className="accounts-note-7">
                                Closing Balance (Snapshotted)
                              </div>
                            )}
                            <div className="apple-card-balance tabular-nums">
                              {formatCurrency(snap ? snap.closingBalance : currentBal, currencySymbol)}
                            </div>
                          </div>
                          {!isReviewMode && (
                            <div className="apple-card-projected tabular-nums">
                              Projected end <strong>{formatCurrency(endingBal, currencySymbol)}</strong>
                            </div>
                          )}
                        </div>

                        {/* Snapshotted 2x2 Specs Grid in Review Mode */}
                        {snap && (
                          <div className="accounts-grid">
                            <div>
                              <span className="accounts-note-8">Opening Balance</span>
                              <span className="tabular-nums accounts-note-9">{formatCurrency(snap.openingBalance, currencySymbol)}</span>
                            </div>
                            <div>
                              <span className="accounts-note-8">Total Inflow</span>
                              <span className="tabular-nums accounts-note-10">
                                +{formatCurrency(snap.totalInflow, currencySymbol)}
                              </span>
                            </div>
                            <div>
                              <span className="accounts-note-8">Total Outflow</span>
                              <span className="tabular-nums accounts-note-9">-{formatCurrency(snap.totalOutflow, currencySymbol)}</span>
                            </div>
                            <div>
                              <span className="accounts-note-8">Net Movement</span>
                              <span className="tabular-nums accounts-note-11">
                                {formatCurrency(snap.totalInflow - snap.totalOutflow, currencySymbol)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* High-Contrast Breach Indicator if breached */}
                        {hasBreach && (
                          <div className="accounts-row-7">
                            <AlertTriangleIcon size={13} />
                            <span>{minBal > 0 ? `Projected to dip below min balance (${formatCurrency(minBal, currencySymbol)})` : `Overdrawn balance (${formatCurrency(currentBal, currencySymbol)})`}</span>
                          </div>
                        )}

                        {/* Bottom Row: Status on Bottom Left, Action Buttons on Bottom Right */}
                        <div className="apple-card-footer">
                          <span className={`apple-status-chip ${hasBreach ? 'breached' : 'healthy'}`}>
                            <span className="apple-status-dot" />
                            <span>{hasBreach ? 'Breached' : 'Healthy'}</span>
                          </span>

                          {!isReviewMode && (
                            <div className="apple-card-actions">
                              <button
                                type="button"
                                className="btn-icon accounts-btn-4"
                                onClick={() => handleOpenTransfer({ type: 'wallet', id: wallet._id || wallet.id })}
                                title="Transfer Funds"
                                aria-label="Transfer from Wallet"
                              >
                                <ArrowRightLeftIcon size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon accounts-btn-4"
                                onClick={() => handleOpenEditWallet(wallet)}
                                title="Edit Wallet"
                              >
                                <EditIcon size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon accounts-btn-4"
                                onClick={() => onArchiveWallet?.(wallet._id || wallet.id)}
                                title="Archive Wallet"
                              >
                                <TrashIcon size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Segment 3: Transfers (Option A: Apple Wallet Inset Table) */}
          {activeSegment === 'transfers' && (
            <div>
              {transfers.length === 0 ? (
                <div className="apple-empty-card">
                  <ArrowRightLeftIcon size={32} style={{ opacity: 0.5, color: 'var(--text-secondary)' }} />
                  <button
                    type="button"
                    className="btn-primary accounts-btn-3"
                    onClick={() => handleOpenTransfer()}
                  >
                    + Transfer Funds
                  </button>
                </div>
              ) : (
                <div className="apple-inset-group account-card-anim">
                  {transfers.map((tr) => {
                    const allAccountsList = [...(bankAccounts || []), ...(wallets || [])];
                    const sBankId = tr.sourceBankAccountId?._id || tr.sourceBankAccountId;
                    const sWalletId = tr.sourceWalletId?._id || tr.sourceWalletId;
                    const sBank = bankAccounts.find((b) => (b._id || b.id) === sBankId) || (typeof tr.sourceBankAccountId === 'object' ? tr.sourceBankAccountId : null);
                    const sWallet = wallets.find((w) => (w._id || w.id) === sWalletId) || (typeof tr.sourceWalletId === 'object' ? tr.sourceWalletId : null);
                    const sAcc = allAccountsList.find((a) => (a._id || a.id) === (tr.sourceAccountId || sBankId || sWalletId));
                    const sourceName = sAcc?.name || sBank?.name || sWallet?.name || 'Source Account';

                    const dBankId = tr.destinationBankAccountId?._id || tr.destinationBankAccountId;
                    const dWalletId = tr.destinationWalletId?._id || tr.destinationWalletId;
                    const dBank = bankAccounts.find((b) => (b._id || b.id) === dBankId) || (typeof tr.destinationBankAccountId === 'object' ? tr.destinationBankAccountId : null);
                    const dWallet = wallets.find((w) => (w._id || w.id) === dWalletId) || (typeof tr.destinationWalletId === 'object' ? tr.destinationWalletId : null);
                    const dAcc = allAccountsList.find((a) => (a._id || a.id) === (tr.destinationAccountId || dBankId || dWalletId));
                    const destName = dAcc?.name || dBank?.name || dWallet?.name || 'Destination Account';

                    return (
                      <div key={tr._id || tr.id} className="apple-inset-row">
                        <div className="accounts-row-4">
                          <div className="accounts-row-8">
                            <ArrowRightLeftIcon size={14} />
                          </div>
                          <div>
                            <div className="accounts-row-9">
                              <span>{sourceName}</span>
                              <ArrowRightIcon size={11} style={{ color: 'var(--text-secondary)' }} />
                              <span>{destName}</span>
                            </div>
                            <div className="accounts-note-13">
                              <span className="tabular-nums">{formatDisplayDate(tr.date, true)}</span>
                              {tr.note ? ` • ${tr.note}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="accounts-row-4">
                          <div className="tabular-nums accounts-text-2">
                            {formatCurrency(tr.amount, currencySymbol)}
                          </div>
                          <Chip tone="good">Settled</Chip>
                          {!isReviewMode && (
                            <button
                              type="button"
                              className="btn-icon accounts-btn-5"
                              onClick={() => onDeleteTransfer?.(tr._id || tr.id)}
                              title="Delete Transfer"
                            >
                              <TrashIcon size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Credit cards: what is owed, bills to confirm or pay, and the payability score */}
      <CardsPanel
        bankAccounts={bankAccounts}
        wallets={wallets}
        simulationCards={creditCards}
        simulation={simulation}
        onPayBill={onOpenUnifiedEntry ? (card) => onOpenUnifiedEntry('transfer', { moveTarget: 'card', cardId: card.id }) : undefined}
        currencySymbol={currencySymbol}
        isReviewMode={isReviewMode}
        onChanged={onHeldLentChanged}
      />

      {/* Held & Lent money: other people's money with you, and yours with them */}
      <PeoplePanel
        bankAccounts={bankAccounts}
        transactions={transactions}
        wallets={wallets}
        currencySymbol={currencySymbol}
        month={month}
        simulation={simulation}
        isReviewMode={isReviewMode}
        onChanged={onHeldLentChanged}
      />

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
            <div className="accounts-row-10">
              <h3 className="accounts-heading">{editingBank ? 'Edit Bank Account' : 'Add Bank Account'}</h3>
              <button type="button" className="btn-icon" onClick={() => requestClose()} title="Close" aria-label="Close">
                <XIcon size={14} />
              </button>
            </div>

            <form className="accounts-stack" onSubmit={(e) => handleSaveBank(e, requestClose)}>
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

              <div className="accounts-grid-2">
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

              <div className="accounts-grid-2">
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
                  {historyWarning(editingBank, bankOpeningBalance)}
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

              <div className="accounts-row-11">
                <input
                  type="checkbox"
                  id="bankIsPrimary"
                  checked={bankIsPrimary}
                  onChange={(e) => setBankIsPrimary(e.target.checked)}
                />
                <label className="accounts-label" htmlFor="bankIsPrimary">
                  Set as primary bank account (pre-selected in entries)
                </label>
              </div>

              {bankError && <div className="form-error" role="alert">{bankError}</div>}

              <div className="accounts-row-12">
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
            <div className="accounts-row-10">
              <h3 className="accounts-heading">{editingWallet ? 'Edit Wallet' : 'Add Wallet'}</h3>
              <button type="button" className="btn-icon" onClick={() => requestClose()} title="Close" aria-label="Close">
                <XIcon size={14} />
              </button>
            </div>

            <form className="accounts-stack" onSubmit={(e) => handleSaveWallet(e, requestClose)}>
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

              <div className="accounts-grid-2">
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
                  {historyWarning(editingWallet, walletOpeningBalance)}
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

              <div className="accounts-row-11">
                <input
                  type="checkbox"
                  id="walletIsPrimary"
                  checked={walletIsPrimary}
                  onChange={(e) => setWalletIsPrimary(e.target.checked)}
                />
                <label className="accounts-label" htmlFor="walletIsPrimary">
                  Set as primary wallet (pre-selected in entries)
                </label>
              </div>

              {walletError && <div className="form-error" role="alert">{walletError}</div>}

              <div className="accounts-row-12">
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

    </div>
  );
}
