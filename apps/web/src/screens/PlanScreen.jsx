import React, { useState, useMemo } from 'react';
import { formatCurrency } from '@budget/engine';
import { SafeVelocityCard, DetailedKpiGrid } from '../components/SummaryCards.jsx';
import { StepLineChart } from '../components/StepLineChart.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { PlusIcon, BuildingLibraryIcon, WalletIcon, ArrowRightLeftIcon } from '../components/Icons.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

export function PlanScreen({
  month,
  items,
  simulation,
  bankAccounts = [],
  wallets = [],
  migrationEligible = false,
  onOpenMigration = null,
  onOpenUnifiedEntry,
  onOpenReview
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');

  const {
    events = [],
    dailyBalances = [],
    endingBalance = 0,
    todayBalance,
    lowestBalance = 0,
    lowestDate = '',
    floorBreached = false,
    unplannedAllowance = 0,
    allowanceLeft = 0,
    daysLeft = 1,
    safeToSpendPerDay = 0
  } = simulation || {};

  const now = new Date();
  const isCurrentCalendarMonth = month ? (month.year === now.getFullYear() && month.month === (now.getMonth() + 1)) : false;
  const currentDay = isCurrentCalendarMonth ? now.getDate() : null;

  // Selected account metadata
  const selectedBank = useMemo(
    () => bankAccounts.find((b) => (b._id || b.id) === selectedAccountId),
    [bankAccounts, selectedAccountId]
  );
  const selectedWallet = useMemo(
    () => wallets.find((w) => (w._id || w.id) === selectedAccountId),
    [wallets, selectedAccountId]
  );
  const selectedAccount = selectedBank || selectedWallet;
  const isFilteringAccount = selectedAccountId !== 'all' && Boolean(selectedAccount);

  // Filtered daily balances curve
  const activeDailyBalances = useMemo(() => {
    if (!isFilteringAccount) return dailyBalances;
    const sid = String(selectedAccountId || '');
    const alt1 = String(selectedAccount?._id || '');
    const alt2 = String(selectedAccount?.id || '');

    let acctCurve =
      simulation?.accountDailyBalances?.[selectedAccountId] ||
      (selectedAccount?._id ? simulation?.accountDailyBalances?.[selectedAccount._id] : null) ||
      (selectedAccount?.id ? simulation?.accountDailyBalances?.[selectedAccount.id] : null);

    if (!acctCurve && simulation?.accountDailyBalances) {
      const matchEntry = Object.entries(simulation.accountDailyBalances).find(
        ([key]) => key === sid || (alt1 && key === alt1) || (alt2 && key === alt2)
      );
      if (matchEntry) {
        acctCurve = matchEntry[1];
      }
    }

    if (acctCurve && acctCurve.length) {
      return acctCurve;
    }

    // Isolated account curve fallback: when no transactions are recorded for this account,
    // draw an accurate flat curve at its opening balance instead of falling back to global daily balances
    const acctOpening =
      (selectedAccount?.openingBalance !== undefined ? Number(selectedAccount.openingBalance) : 0);

    const totalDays = dailyBalances?.length || 30;
    return Array.from({ length: totalDays }, (_, i) => {
      const d = i + 1;
      const ref = dailyBalances?.[i];
      const dateStr = ref?.date || `${month.year}-${String(month.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return {
        day: d,
        date: dateStr,
        balance: acctOpening
      };
    });
  }, [isFilteringAccount, simulation, selectedAccountId, selectedAccount, dailyBalances, month]);

  // Filtered events
  const activeEvents = useMemo(() => {
    if (!isFilteringAccount) return events;

    const normSelectedId = String(selectedAccountId || '');
    const designatedSalaryBankId = String(
      month?.salaryBankAccountId?._id ||
      month?.salaryBankAccountId?.id ||
      month?.salaryBankAccountId ||
      ''
    );
    const isDesignatedSalaryBank = designatedSalaryBankId && designatedSalaryBankId === normSelectedId;
    const isSoleBank = bankAccounts.length === 1 && selectedBank;

    return events.filter((ev) => {
      const sBankId = ev.sourceBankAccountId ? String(ev.sourceBankAccountId._id || ev.sourceBankAccountId.id || ev.sourceBankAccountId) : null;
      const sWalletId = ev.sourceWalletId ? String(ev.sourceWalletId._id || ev.sourceWalletId.id || ev.sourceWalletId) : null;
      const dBankId = ev.destinationBankAccountId ? String(ev.destinationBankAccountId._id || ev.destinationBankAccountId.id || ev.destinationBankAccountId) : null;
      const dWalletId = ev.destinationWalletId ? String(ev.destinationWalletId._id || ev.destinationWalletId.id || ev.destinationWalletId) : null;
      const bId = ev.bankAccountId ? String(ev.bankAccountId._id || ev.bankAccountId.id || ev.bankAccountId) : null;
      const wId = ev.walletId ? String(ev.walletId._id || ev.walletId.id || ev.walletId) : null;

      if (bId === normSelectedId || wId === normSelectedId) return true;
      if (sBankId === normSelectedId || sWalletId === normSelectedId) return true;
      if (dBankId === normSelectedId || dWalletId === normSelectedId) return true;

      // Salary event check: matches designated bank, primary bank, or sole bank
      if (ev.isSalary && selectedBank) {
        if (isDesignatedSalaryBank || (!designatedSalaryBankId && (selectedBank.isPrimary || isSoleBank))) {
          return true;
        }
      }

      // If an event has no bank or wallet assigned, fallback to primary bank, designated salary bank, or sole bank
      if (!bId && !wId && !sBankId && !sWalletId && selectedBank) {
        if (selectedBank.isPrimary || isDesignatedSalaryBank || isSoleBank) {
          return true;
        }
      }

      return false;
    });
  }, [isFilteringAccount, events, selectedAccountId, selectedBank, month, bankAccounts]);

  const hasAccounts = (bankAccounts?.length || 0) > 0 || (wallets?.length || 0) > 0;

  // Account specific metrics with full ID & AltId fallback
  const activeAccountSummary = simulation?.accounts?.[selectedAccountId] ||
    (selectedAccount?._id ? simulation?.accounts?.[selectedAccount._id] : null) ||
    (selectedAccount?.id ? simulation?.accounts?.[selectedAccount.id] : null) ||
    (Array.isArray(simulation?.accountSummaries)
      ? simulation.accountSummaries.find((a) => {
          const sid = String(selectedAccountId || '');
          const alt1 = String(selectedAccount?._id || '');
          const alt2 = String(selectedAccount?.id || '');
          const aid = String(a.id || '');
          const aAlt = String(a.altId || '');
          return (
            aid === sid || aAlt === sid ||
            (alt1 && (aid === alt1 || aAlt === alt1)) ||
            (alt2 && (aid === alt2 || aAlt === alt2))
          );
        })
      : null);

  const totalAccountsSafetyFloor = (bankAccounts || []).reduce((sum, b) => sum + (Number(b.minimumBalance) || 0), 0) +
    (wallets || []).reduce((sum, w) => sum + (Number(w.minimumBalance) || 0), 0);

  const activeSafetyFloor = isFilteringAccount
    ? (selectedAccount?.minimumBalance || 0)
    : (hasAccounts ? totalAccountsSafetyFloor : (month?.safetyFloor || 0));

  const normSelectedId = String(selectedAccountId || '');
  const designatedSalaryBankId = String(
    month?.salaryBankAccountId?._id ||
    month?.salaryBankAccountId?.id ||
    month?.salaryBankAccountId ||
    ''
  );
  const isSalaryAccount = isFilteringAccount && Boolean(
    (designatedSalaryBankId && normSelectedId === designatedSalaryBankId) ||
    (!designatedSalaryBankId && (selectedBank?.isPrimary || bankAccounts.length === 1))
  );

  const activeLowestPt = useMemo(() => {
    if (!isFilteringAccount) {
      return {
        date: simulation?.lowestDate || lowestDate,
        balance: simulation?.lowestBalance !== undefined ? simulation.lowestBalance : lowestBalance
      };
    }
    // If account summary is already populated with Option 2 lowest calculation, use it directly
    if (activeAccountSummary && activeAccountSummary.lowestBalance !== undefined) {
      return {
        date: activeAccountSummary.lowestDate,
        balance: activeAccountSummary.lowestBalance
      };
    }
    if (!activeDailyBalances.length) return { date: '', balance: 0 };

    const pastPts = typeof currentDay === 'number' && currentDay >= 1
      ? activeDailyBalances.filter((pt) => pt.day < currentDay)
      : [];
    const futurePts = typeof currentDay === 'number' && currentDay >= 1
      ? activeDailyBalances.filter((pt) => pt.day >= currentDay)
      : activeDailyBalances;

    const pastTouchedZero = pastPts.some((pt) => pt.balance <= 0);
    const eligiblePts = (pastTouchedZero && futurePts.length > 0) ? futurePts : activeDailyBalances;

    return eligiblePts.reduce(
      (min, pt) => (pt.balance < min.balance ? pt : min),
      eligiblePts[0]
    );
  }, [isFilteringAccount, activeAccountSummary, activeDailyBalances, simulation, lowestDate, lowestBalance, currentDay]);

  const activeFloorBreached = isFilteringAccount
    ? (activeAccountSummary ? activeAccountSummary.floorBreached : activeLowestPt.balance < activeSafetyFloor)
    : floorBreached;

  // Unified sums across all registered bank accounts and wallets (deduplicated by ID)
  const accountsList = useMemo(() => {
    if (Array.isArray(simulation?.accountSummaries) && simulation.accountSummaries.length > 0) {
      return simulation.accountSummaries;
    }
    const map = new Map();
    Object.values(simulation?.accounts || {}).forEach((a) => {
      if (a && a.id && !map.has(a.id)) {
        map.set(a.id, a);
      }
    });
    return Array.from(map.values());
  }, [simulation]);

  const unifiedIncome = simulation?.incomeAmount !== undefined
    ? simulation.incomeAmount
    : (hasAccounts && accountsList.length > 0
        ? accountsList.reduce((sum, a) => sum + (a.incomeAmount || 0), 0)
        : (month?.incomeAmount || 0));

  const unifiedTodayBalance = simulation?.todayBalance !== undefined
    ? simulation.todayBalance
    : (hasAccounts && accountsList.length > 0
        ? accountsList.reduce((sum, a) => sum + (a.todayBalance || 0), 0)
        : todayBalance);

  const unifiedEndingBalance = simulation?.endingBalance !== undefined
    ? simulation.endingBalance
    : (hasAccounts && accountsList.length > 0
        ? accountsList.reduce((sum, a) => sum + (a.endingBalance || 0), 0)
        : endingBalance);

  // Safe Velocity: isolated for filtered account, unified for all accounts
  const activeSafeVelocity = isFilteringAccount
    ? (activeAccountSummary?.safeVelocity || simulation?.safeVelocity)
    : simulation?.safeVelocity;

  const activeSafeToSpend = isFilteringAccount
    ? (activeAccountSummary?.safeVelocity?.rate ?? safeToSpendPerDay)
    : (simulation?.safeVelocity?.safeVelocityPerDay ?? safeToSpendPerDay);

  const activeAllowanceLeft = isFilteringAccount
    ? (activeAccountSummary?.safeVelocity?.allowanceLeft ?? allowanceLeft)
    : (simulation?.safeVelocity?.freeSurplus ?? allowanceLeft);

  if (!month) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '30px' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
          No active budget month selected.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Prominent Data Transfer Banner */}
      {migrationEligible && (
        <div
          className="card"
          style={{
            background: 'var(--surface-subtle)',
            border: '2px solid var(--text)',
            padding: '16px',
            marginBottom: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BuildingLibraryIcon size={18} />
              <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Transfer Existing Calculations to Bank Account
              </span>
            </div>
            <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', fontWeight: 600 }}>
              1-Tap Ingestion
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Your current active month calculations ({formatCurrency(todayBalance, month.currencySymbol)} today's balance, {formatCurrency(month.incomeAmount, month.currencySymbol)} income, across all planned items) are ready to be transferred into your new Primary Bank Account so every balance is backed by real banking truth.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '7px 16px', fontSize: '12px' }}
              onClick={onOpenMigration}
            >
              Transfer Existing Calculations Now
            </button>
          </div>
        </div>
      )}

      {/* Account Filter & Action Toolbar */}
      <div className="account-filter-bar">
        <div className="account-filter-track">
          {hasAccounts && (
            <>
              <button
                type="button"
                className={`filter-pill account-filter-pill ${selectedAccountId === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedAccountId('all')}
              >
                <span>All Accounts (Unified)</span>
              </button>

              {bankAccounts.map((b) => {
                const accId = b._id || b.id;
                const isSelected = selectedAccountId === accId;
                const accSim = simulation?.accounts?.[accId];
                const bal = accSim ? accSim.todayBalance : (b.openingBalance || 0);
                const hasBreach = accSim?.floorBreached;

                return (
                  <button
                    key={accId}
                    type="button"
                    className={`filter-pill account-filter-pill ${isSelected ? 'active' : ''} ${hasBreach ? 'breached' : ''}`}
                    onClick={() => setSelectedAccountId(accId)}
                  >
                    <BuildingLibraryIcon size={12} />
                    <span>{b.name}</span>
                    <span className="tabular-nums" style={{ opacity: isSelected ? 1 : 0.8, fontWeight: 700 }}>
                      {formatCurrency(bal, month.currencySymbol)}
                    </span>
                    {hasBreach && <span style={{ fontSize: '10px' }}>▲</span>}
                  </button>
                );
              })}

              {wallets.map((w) => {
                const accId = w._id || w.id;
                const isSelected = selectedAccountId === accId;
                const accSim = simulation?.accounts?.[accId];
                const bal = accSim ? accSim.todayBalance : (w.openingBalance || 0);
                const hasBreach = accSim?.floorBreached;

                return (
                  <button
                    key={accId}
                    type="button"
                    className={`filter-pill account-filter-pill ${isSelected ? 'active' : ''} ${hasBreach ? 'breached' : ''}`}
                    onClick={() => setSelectedAccountId(accId)}
                  >
                    <WalletIcon size={12} />
                    <span>{w.name}</span>
                    <span className="tabular-nums" style={{ opacity: isSelected ? 1 : 0.8, fontWeight: 700 }}>
                      {formatCurrency(bal, month.currencySymbol)}
                    </span>
                    {hasBreach && <span style={{ fontSize: '10px' }}>▲</span>}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="account-toolbar-actions">
          {isFilteringAccount && (
            <button
              type="button"
              className="btn-subtle"
              onClick={() => setSelectedAccountId('all')}
              style={{ fontSize: '11px', padding: '4px 8px' }}
              title="Reset to Unified View"
            >
              Reset to Unified
            </button>
          )}
          <button
            type="button"
            className="btn-primary desktop-only-btn"
            style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            onClick={() => onOpenUnifiedEntry?.('log')}
          >
            <PlusIcon size={14} />
            <span>New Entry</span>
          </button>
        </div>
      </div>

      {/* Account Isolated Notification Pill */}
      {isFilteringAccount && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 12px',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border)',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedBank ? <BuildingLibraryIcon size={13} /> : <WalletIcon size={13} />}
            <span>
              Viewing isolated trajectory for <strong>{selectedAccount.name}</strong>
              {selectedAccount?.minimumBalance ? ` • Min Balance: ${formatCurrency(selectedAccount.minimumBalance, month.currencySymbol)}` : ''}
              {activeAccountSummary ? ` • Projected End: ${formatCurrency(activeAccountSummary.endingBalance, month.currencySymbol)}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="btn-subtle"
            onClick={() => setSelectedAccountId('all')}
            style={{ fontSize: '11px', padding: '2px 8px' }}
          >
            Reset
          </button>
        </div>
      )}

      {/* Top Split: Symmetrical Bento Left Insights and Right Timeline Curve */}
      <div className="dashboard-top-grid">
        {/* COMPONENT 1: TOP-LEFT INSIGHTS */}
        <div className="dashboard-insights-panel">
          {/* Safe Velocity Card */}
          <SafeVelocityCard
            safeVelocity={activeSafeVelocity}
            daysLeft={daysLeft}
            safeToSpendPerDay={activeSafeToSpend}
            allowanceLeft={activeAllowanceLeft}
            currencySymbol={month.currencySymbol}
          />

          {/* Detailed KPI Cards */}
          <DetailedKpiGrid
            incomeAmount={isFilteringAccount ? (activeAccountSummary?.incomeAmount ?? 0) : unifiedIncome}
            incomeCreditDay={month.incomeCreditDay}
            events={activeEvents}
            totalExpenses={isFilteringAccount ? activeAccountSummary?.totalExpenses : simulation?.totalExpenses}
            endingBalance={isFilteringAccount ? (activeAccountSummary?.endingBalance ?? endingBalance) : unifiedEndingBalance}
            todayBalance={isFilteringAccount ? (activeAccountSummary?.todayBalance ?? todayBalance) : (simulation?.todayBalance ?? unifiedTodayBalance)}
            lowestBalance={isFilteringAccount ? (activeAccountSummary?.lowestBalance !== undefined ? activeAccountSummary.lowestBalance : activeLowestPt.balance) : (simulation?.lowestBalance !== undefined ? simulation.lowestBalance : activeLowestPt.balance)}
            lowestDate={isFilteringAccount ? (activeAccountSummary?.lowestDate || activeLowestPt.date) : (simulation?.lowestDate || activeLowestPt.date)}
            safetyFloor={activeSafetyFloor}
            currencySymbol={month.currencySymbol}
            isSalaryCredited={isSalaryAccount ? Boolean(activeAccountSummary?.isSalaryCredited) : false}
            salaryCreditedDate={isSalaryAccount ? (activeAccountSummary?.salaryCreditedDate || null) : null}
            canEditSalary={isSalaryAccount}
            month={month}
          />
        </div>

        {/* COMPONENT 2: TOP-RIGHT TIMELINE CHART (CURVED LINE) */}
        <div className="dashboard-chart-panel">
          <ErrorBoundary title="Chart unavailable">
            <StepLineChart
              dailyBalances={activeDailyBalances}
              events={activeEvents}
              safetyFloor={activeSafetyFloor}
              currencySymbol={month.currencySymbol}
              floorBreached={activeFloorBreached}
              lowestDate={activeLowestPt.date}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              currentDay={currentDay}
              onOpenReview={onOpenReview}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* COMPONENT 3: BOTTOM FULL-WIDTH INTERACTIVE TIMELINE */}
      <div className="dashboard-bottom-timeline">
        <TimelineList
          events={activeEvents}
          safetyFloor={activeSafetyFloor}
          currencySymbol={month.currencySymbol}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          currentDay={currentDay}
          month={month}
          selectedAccountId={selectedAccountId}
        />
      </div>
    </div>
  );
}
