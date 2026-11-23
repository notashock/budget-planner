import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';
import {
  BuildingLibraryIcon,
  WalletIcon,
  ArrowRightLeftIcon,
  PlusIcon,
  AlertTriangleIcon,
  XIcon,
  EyeIcon
} from '../components/Icons.jsx';
import { ActionMenu } from '../components/ActionMenu.jsx';
import { Sparkline } from '../components/MonthHealthHero.jsx';
import { api } from '../api.js';
import { PeoplePanel } from '../components/PeoplePanel.jsx';
import { CardsPanel } from '../components/CardsPanel.jsx';
import { liveBalance } from '../utils/liveBalance.js';


export function AccountsScreen({
  bankAccounts = [],
  transactions = [],
  wallets = [],
  simulation = null,
  // Per-account month simulations from the server (daily balances for the sparkline)
  accountSimulations = {},
  currencySymbol = '₹',
  onSaveBankAccount,
  onSaveWallet,
  onArchiveBankAccount,
  onArchiveWallet,
  onCreateTransfer,
  // Opens the entry sheet: ('transfer', { sourceAccountId }) for the Move tab
  onOpenUnifiedEntry,
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
  const [openId, setOpenId] = useState(null); // the account whose page is open
  const [addCardRequest, setAddCardRequest] = useState(0);
  const [addPersonRequest, setAddPersonRequest] = useState(0);
  const [netWorth, setNetWorth] = useState(null);
  const [netWorthRequest, setNetWorthRequest] = useState(0);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
  const [preselectedSource, setPreselectedSource] = useState(null);

  // Net worth is computed by the server (bank + wallets + lent − cards − held)
  const balancesKey = [...bankAccounts, ...wallets].map((a) => a.currentBalance).join(',');
  useEffect(() => {
    if (!month?.year || !month?.month || isReviewMode) { setNetWorth(null); return undefined; }
    let live = true;
    api.getMonthSummary(month.year, month.month)
      .then((s) => { if (live) setNetWorth(s?.netWorth || null); })
      .catch(() => { if (live) setNetWorth(null); });
    return () => { live = false; };
  }, [month?.year, month?.month, isReviewMode, balancesKey, netWorthRequest]);
  const panelChanged = () => { setNetWorthRequest((n) => n + 1); onHeldLentChanged?.(); };

  useEffect(() => {
    if (initialOpenBankModal) {
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

  // One row per bank or wallet: the month-end snapshot in review mode, else today's balance
  const rowFor = (acc, kind) => {
    const id = acc._id || acc.id;
    const simAcc = accountsMap[String(id)];
    const snap = isReviewMode && month?.closingBalances ? month.closingBalances[id] : null;
    const balance = snap ? snap.closingBalance : liveBalance(acc, simAcc, month);
    const minBal = acc.minimumBalance || 0;
    const breached = !isReviewMode && ((kind === 'wallet' && balance < minBal) || (simAcc ? Boolean(simAcc.floorBreached) : balance < minBal));
    const isSalary = kind === 'bank' && Boolean(month?.salaryBankAccountId)
      && String(month.salaryBankAccountId._id || month.salaryBankAccountId) === String(id);
    const caption = kind === 'bank'
      ? [acc.institution || 'Bank', acc.accountNumberMasked ? `•••• ${acc.accountNumberMasked.slice(-4)}` : null]
      : [`${acc.walletType || 'cash'} wallet`];
    return { acc, id, kind, simAcc, snap, balance, minBal, breached, isSalary, caption: caption.filter(Boolean).join(' · ') };
  };
  const bankRows = bankAccounts.map((b) => rowFor(b, 'bank'));
  const walletRows = wallets.map((w) => rowFor(w, 'wallet'));
  const openRow = openId ? [...bankRows, ...walletRows].find((r) => String(r.id) === String(openId)) : null;

  const recentFor = (id) => transactions
    .filter((t) => t && t.status === 'successful'
      && (String(t.accountId) === String(id) || String(t.destinationAccountId) === String(id)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);

  const signed = (v) => `${v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), currencySymbol)}`;

  const breachNote = (r) => (
    <div className="accounts-row-7" role="note">
      <AlertTriangleIcon size={13} />
      <span>{r.minBal > 0 ? `Projected to dip below min balance (${formatCurrency(r.minBal, currencySymbol)})` : `Overdrawn balance (${formatCurrency(r.balance, currencySymbol)})`}</span>
    </div>
  );

  const rowList = (title, rows, addLabel, onAdd) => (
    <section className="acct-section" aria-label={title}>
      <h2 className="acct-section-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="acct-inset acct-empty">
          {isReviewMode ? <span>None</span> : <button type="button" className="acct-empty-add" onClick={onAdd}>+ {addLabel}</button>}
        </div>
      ) : (
        <ul className="acct-inset">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={`acct-row${r.breached ? ' breached' : ''}`} onClick={() => setOpenId(r.id)}>
                <span className={`acct-row-icon ${r.kind}`} aria-hidden="true">
                  {r.kind === 'bank' ? <BuildingLibraryIcon size={16} /> : <WalletIcon size={16} />}
                </span>
                <span className="acct-row-main">
                  <span className="acct-row-title">{r.acc.name}</span>
                  <span className="acct-row-caption">
                    {r.acc.isPrimary && <span className="acct-tag">Primary</span>}
                    {r.isSalary && <span className="acct-tag" data-testid="salary-depository-badge">Salary</span>}
                    <span className="acct-row-caption-text">{r.breached ? 'Dips below its keep-at-least' : r.caption}</span>
                  </span>
                </span>
                <span className="acct-row-balance tabular-nums">{formatCurrency(r.balance, currencySymbol)}</span>
                <span className="acct-row-chev" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  // A pushed page for one bank or wallet
  const renderAccountPage = (r) => {
    const isBank = r.kind === 'bank';
    const daily = accountSimulations?.[r.id]?.dailyBalances || simulation?.accountDailyBalances?.[r.id] || [];
    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayIdx = daily.findIndex((p) => p.date === todayLocal);
    const endingBal = r.simAcc ? r.simAcc.endingBalance : (r.acc.openingBalance || 0);
    const recent = recentFor(r.id);
    return (
      <div className="acct-page" data-testid="account-page">
        <button type="button" className="acct-back" onClick={() => setOpenId(null)}>‹ Accounts</button>
        <ScreenHeader
          title={r.acc.name}
          actions={!isReviewMode && (
            <>
              <button
                type="button"
                className="btn-secondary accounts-btn"
                onClick={() => handleOpenTransfer({ type: r.kind, id: r.id })}
                aria-label={isBank ? 'Transfer from Account' : 'Transfer from Wallet'}
              >
                <ArrowRightLeftIcon size={14} />
                <span>Transfer</span>
              </button>
              <ActionMenu
                label={`More actions for ${r.acc.name}`}
                items={[
                  { label: isBank ? 'Edit account' : 'Edit wallet', onClick: () => (isBank ? handleOpenEditBank(r.acc) : handleOpenEditWallet(r.acc)) },
                  { label: 'Archive', danger: true, onClick: () => { setOpenId(null); (isBank ? onArchiveBankAccount : onArchiveWallet)?.(r.id); } },
                ]}
              />
            </>
          )}
        />
        <p className="acct-page-caption">
          {r.caption}
          {r.acc.isPrimary && <span className="acct-tag">Primary</span>}
          {r.isSalary && <span className="acct-tag">Salary</span>}
        </p>

        <section className="acct-hero" aria-label="Balance">
          {r.snap && <div className="acct-hero-label">Closing Balance (Snapshotted)</div>}
          <div className="acct-hero-value tabular-nums">{formatCurrency(r.balance, currencySymbol)}</div>
          {!isReviewMode && <p className="acct-hero-caption tabular-nums">Projected end of month {formatCurrency(endingBal, currencySymbol)}</p>}
          {daily.length > 1 && (
            <div className="acct-spark">
              <Sparkline dailyBalances={daily} currentDay={todayIdx >= 0 ? todayIdx + 1 : null} />
              <span className="acct-spark-label">This month</span>
            </div>
          )}
        </section>

        {r.breached && breachNote(r)}

        {r.snap && (
          <div className="accounts-grid">
            <div>
              <span className="accounts-note-8">Opening Balance</span>
              <span className="tabular-nums accounts-note-9">{formatCurrency(r.snap.openingBalance, currencySymbol)}</span>
            </div>
            <div>
              <span className="accounts-note-8">Total Inflow</span>
              <span className="tabular-nums accounts-note-10">+{formatCurrency(r.snap.totalInflow, currencySymbol)}</span>
            </div>
            <div>
              <span className="accounts-note-8">Total Outflow</span>
              <span className="tabular-nums accounts-note-9">-{formatCurrency(r.snap.totalOutflow, currencySymbol)}</span>
            </div>
            <div>
              <span className="accounts-note-8">Net Movement</span>
              <span className="tabular-nums accounts-note-11">{formatCurrency(r.snap.totalInflow - r.snap.totalOutflow, currencySymbol)}</span>
            </div>
          </div>
        )}

        <ul className="acct-inset">
          <li className="acct-kv">
            <span>Keep at least</span>
            <span className="tabular-nums">{formatCurrency(r.minBal, currencySymbol)}</span>
          </li>
        </ul>

        <section className="acct-section" aria-label="Recent activity">
          <h2 className="acct-section-title">Recent activity</h2>
          {recent.length === 0 ? (
            <div className="acct-inset acct-empty"><span>Nothing paid in or out this month yet.</span></div>
          ) : (
            <ul className="acct-inset">
              {recent.map((t) => {
                const incoming = String(t.destinationAccountId) === String(r.id)
                  || (String(t.accountId) === String(r.id) && (t.isIncome || t.origin === 'held_in' || t.origin === 'lent_repaid'));
                return (
                  <li key={t._id || t.id} className="acct-kv">
                    <span className="acct-row-main">
                      <span className="acct-row-title">{t.name || t.category || 'Transaction'}</span>
                      <span className="acct-row-caption tabular-nums">{formatDisplayDate(t.date, true)}</span>
                    </span>
                    <span className={`tabular-nums acct-amount${incoming ? ' positive' : ''}`}>
                      {incoming ? '+' : '−'}{formatCurrency(Math.abs(Number(t.amount) || 0), currencySymbol)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  };

  const netWorthParts = netWorth
    ? [['Bank & wallets', netWorth.cash], ['Lent', netWorth.lent], ['Cards', -netWorth.cardsOwed], ['Held for others', -netWorth.held]]
      .filter(([, v], i) => i === 0 || v)
    : [];

  return (
    <div className="screen-content">
      {openRow ? renderAccountPage(openRow) : (
        <>
          <ScreenHeader
            title="Accounts"
            actions={!isReviewMode && (
              <ActionMenu
                label="Add"
                className="acct-add-menu"
                triggerContent={<PlusIcon size={16} />}
                items={[
                  { label: 'Bank account', onClick: handleOpenAddBank },
                  { label: 'Wallet', onClick: handleOpenAddWallet },
                  { label: 'Card', onClick: () => setAddCardRequest((n) => n + 1) },
                  { label: 'Person', onClick: () => setAddPersonRequest((n) => n + 1) },
                ]}
              />
            )}
          />

          <section className="acct-hero" aria-label="Net worth">
            <div className="acct-hero-label">{isReviewMode ? 'Total across accounts' : (netWorth ? 'Net worth' : 'Bank & wallets')}</div>
            <div className="acct-hero-value tabular-nums" data-testid="net-worth">
              {formatCurrency(netWorth ? netWorth.total : totalPortfolioBalance, currencySymbol)}
            </div>
            {netWorthParts.length > 1 && (
              <p className="acct-hero-caption tabular-nums">{netWorthParts.map(([l, v]) => `${l} ${signed(v)}`).join(' · ')}</p>
            )}
            {isReviewMode && (
              <span className="review-badge-tag accounts-row-2"><EyeIcon size={13} /> Month-end balances</span>
            )}
          </section>

          {/* Legacy Migration Callout Banner */}
          {isMigrationEligible && (
            <div className="accounts-row-3" data-testid="migration-callout-banner">
              <div className="accounts-row-4">
                <div className="accounts-row-5"><BuildingLibraryIcon size={18} /></div>
                <div>
                  <div className="accounts-text">Upgrade & Link Account</div>
                  <div className="accounts-note-2">
                    You have legacy balances and budget records ready to link into a designated primary bank account.
                  </div>
                </div>
              </div>
              <button type="button" className="btn-primary accounts-btn-2" onClick={handleOpenAddBank}>
                Link Primary Account
              </button>
            </div>
          )}

          {rowList('Bank accounts', bankRows, 'Add a bank account', handleOpenAddBank)}
          {rowList('Wallets', walletRows, 'Add a wallet', handleOpenAddWallet)}
        </>
      )}

      {/* Kept mounted on the account page so the ＋ menu and their data stay ready */}
      <div hidden={Boolean(openRow)}>
      {/* Credit cards: what is owed, bills to confirm or pay, and the payability score */}
      <CardsPanel
        bankAccounts={bankAccounts}
        wallets={wallets}
        simulationCards={creditCards}
        simulation={simulation}
        onPayBill={onOpenUnifiedEntry ? (card) => onOpenUnifiedEntry('transfer', { moveTarget: 'card', cardId: card.id }) : undefined}
        currencySymbol={currencySymbol}
        isReviewMode={isReviewMode}
        onChanged={panelChanged}
        addRequest={addCardRequest}
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
        onChanged={panelChanged}
        addRequest={addPersonRequest}
      />
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
