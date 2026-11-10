import React, { useState, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { formatCurrency, calculateIrregularMetrics } from '@budget/engine';
import {
  SafeVelocityCard,
  DetailedKpiGrid,
  IrregularHeroCards,
  QuarterlyBreakdownTable
} from '../components/SummaryCards.jsx';
import { StepLineChart } from '../components/StepLineChart.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { PlusIcon, BuildingLibraryIcon, WalletIcon, ArrowRightLeftIcon, AlertTriangleIcon } from '../components/Icons.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

gsap.registerPlugin(useGSAP);

export function PlanScreen({
  month,
  items,
  transactions = [],
  simulation,
  accountSimulations = {},
  bankAccounts = [],
  wallets = [],
  settings = null,
  migrationEligible = false,
  isReviewMode = false,
  onOpenMigration = null,
  onOpenUnifiedEntry,
  onOpenReview,
  onOpenSalarySafeline,
  onTogglePaid = null,
  onPayTransaction = null,
  onEditTransaction = null
}) {
  const containerRef = useRef(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [timeframe, setTimeframe] = useState('trailing12m'); // 'trailing12m' | 'ytd' | 'quarterly'
  const [viewSubmode, setViewSubmode] = useState('monthly'); // 'monthly' | 'irregular'

  const currencySymbol = month?.currencySymbol || settings?.currencySymbol || '₹';

  // Compute irregular income & runway metrics client-side deterministically
  const irregularMetrics = useMemo(() => {
    return calculateIrregularMetrics({
      transactions,
      accounts: [...bankAccounts, ...wallets]
    });
  }, [transactions, bankAccounts, wallets]);

  const isIrregularDashboard = !month || settings?.incomeMode === 'irregular' || viewSubmode === 'irregular';

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

  const activeSim = useMemo(() => {
    if (isFilteringAccount && accountSimulations?.[selectedAccountId]) {
      return accountSimulations[selectedAccountId];
    }
    return simulation || {};
  }, [isFilteringAccount, accountSimulations, selectedAccountId, simulation]);

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
  } = activeSim || {};

  const now = new Date();
  const isCurrentCalendarMonth = month ? (month.year === now.getFullYear() && month.month === (now.getMonth() + 1)) : false;
  const currentDay = isCurrentCalendarMonth ? now.getDate() : null;

  // Filtered daily balances curve
  const activeDailyBalances = useMemo(() => {
    if (!isFilteringAccount) return dailyBalances;
    if (accountSimulations?.[selectedAccountId]?.dailyBalances?.length) {
      return accountSimulations[selectedAccountId].dailyBalances;
    }
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
      const dateStr = ref?.date || `${month?.year || now.getFullYear()}-${String(month?.month || (now.getMonth() + 1)).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

  useGSAP(() => {
    if (!containerRef.current) return;
    const cards = containerRef.current.querySelectorAll('.summary-card, .dashboard-insights-panel, .dashboard-chart-panel');
    if (cards.length > 0) {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.25, stagger: 0.04, ease: 'power2.out' }
      );
    }
  }, { dependencies: [selectedAccountId, viewSubmode, timeframe], scope: containerRef });

  if (isIrregularDashboard) {
    const quarters = irregularMetrics.quarterly || [];
    const yearly = irregularMetrics.yearly || [];

    return (
      <div className="dashboard-layout" ref={containerRef}>
        {/* Dual Mode Switcher if user has both salary & irregular */}
        {settings?.incomeMode === 'both' && month && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <div style={{ display: 'inline-flex', background: 'var(--surface-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setViewSubmode('monthly')}
                className={`filter-pill ${viewSubmode === 'monthly' ? 'active' : ''}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                Monthly Budget
              </button>
              <button
                type="button"
                onClick={() => setViewSubmode('irregular')}
                className={`filter-pill ${viewSubmode === 'irregular' ? 'active' : ''}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                Runway & Irregular Cashflow
              </button>
            </div>
          </div>
        )}

        {/* Account Filter Bar */}
        <div className="account-filter-bar">
          <div className="account-filter-track">
            <button
              type="button"
              className={`filter-pill account-filter-pill ${selectedAccountId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedAccountId('all')}
            >
              <span>All Accounts ({formatCurrency(irregularMetrics.currentBalance, currencySymbol)})</span>
            </button>
            {bankAccounts.map((b) => (
              <button
                key={b._id || b.id}
                type="button"
                className={`filter-pill account-filter-pill ${selectedAccountId === (b._id || b.id) ? 'active' : ''}`}
                onClick={() => setSelectedAccountId(b._id || b.id)}
              >
                <span>{b.name} ({formatCurrency(b.openingBalance, currencySymbol)})</span>
              </button>
            ))}
            {wallets.map((w) => (
              <button
                key={w._id || w.id}
                type="button"
                className={`filter-pill account-filter-pill ${selectedAccountId === (w._id || w.id) ? 'active' : ''}`}
                onClick={() => setSelectedAccountId(w._id || w.id)}
              >
                <span>{w.name} ({formatCurrency(w.openingBalance, currencySymbol)})</span>
              </button>
            ))}
          </div>

          {!isReviewMode && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={() => onOpenUnifiedEntry('income')}
              >
                + Log Income
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={() => onOpenUnifiedEntry('log')}
              >
                - Log Expense
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={() => onOpenUnifiedEntry('transfer')}
              >
                <ArrowRightLeftIcon size={12} /> Transfer
              </button>
            </div>
          )}
        </div>

        {/* Hero KPI Cards: Runway, Smoothed Income, Liquid Balance, Avg Monthly Spending */}
        <IrregularHeroCards metrics={irregularMetrics} currencySymbol={currencySymbol} />

        {/* Timeframe Selector & Report Content */}
        <div className="card" style={{ padding: '20px', marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Cashflow & Earnings Analysis
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                Volatility-smoothed metrics decoupled from arbitrary month cuts.
              </p>
            </div>

            <div style={{ display: 'inline-flex', background: 'var(--surface-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                className={`filter-pill ${timeframe === 'trailing12m' ? 'active' : ''}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
                onClick={() => setTimeframe('trailing12m')}
              >
                Trailing 12M
              </button>
              <button
                type="button"
                className={`filter-pill ${timeframe === 'quarterly' ? 'active' : ''}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
                onClick={() => setTimeframe('quarterly')}
              >
                Quarterly
              </button>
              <button
                type="button"
                className={`filter-pill ${timeframe === 'ytd' ? 'active' : ''}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
                onClick={() => setTimeframe('ytd')}
              >
                Yearly
              </button>
            </div>
          </div>

          {/* Timeframe View Display */}
          {timeframe === 'quarterly' && (
            <QuarterlyBreakdownTable quarters={quarters} currencySymbol={currencySymbol} />
          )}

          {timeframe === 'trailing12m' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div style={{ padding: '16px', background: 'var(--surface-subtle)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  Trailing 12-Month Inflow
                </span>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success)', margin: '6px 0', fontVariantNumeric: 'tabular-nums' }}>
                  +{formatCurrency(irregularMetrics.trailing12mIncome, currencySymbol)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Smoothed Monthly: {formatCurrency(irregularMetrics.smoothedMonthlyIncome, currencySymbol)} / mo
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--surface-subtle)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  Trailing 12-Month Outflow
                </span>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: '6px 0', fontVariantNumeric: 'tabular-nums' }}>
                  -{formatCurrency(irregularMetrics.trailing12mSpending, currencySymbol)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Average Burn: {formatCurrency(irregularMetrics.avgMonthlySpending, currencySymbol)} / mo
                </div>
              </div>
            </div>
          )}

          {timeframe === 'ytd' && (
            <div style={{ overflowX: 'auto' }}>
              {yearly.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  No yearly transaction records found.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '10px 14px' }}>Year</th>
                      <th style={{ padding: '10px 14px' }}>Total Inflow</th>
                      <th style={{ padding: '10px 14px' }}>Total Outflow</th>
                      <th style={{ padding: '10px 14px' }}>Net Cashflow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearly.map((y) => (
                      <tr key={y.key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{y.year}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--success)' }}>+{formatCurrency(y.income, currencySymbol)}</td>
                        <td style={{ padding: '10px 14px' }}>-{formatCurrency(y.spending, currencySymbol)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: y.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {y.net >= 0 ? '+' : ''}{formatCurrency(y.net, currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Regular salary configuration link if user has no salary template */}
        {!month && onOpenSalarySafeline && (
          <div className="card" style={{ marginTop: '16px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: 'var(--surface-subtle)' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Receive a fixed regular salary?</span>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                You can configure a monthly salary template to automate recurring pay and monthly budget horizons.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '11px', padding: '5px 12px' }}
              onClick={onOpenSalarySafeline}
            >
              Configure Salary Schedule →
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-layout" ref={containerRef}>
      {/* Prominent Data Transfer Banner */}
      {migrationEligible && (
        <div
          className="card"
          style={{
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-subtle)',
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
            <span style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', fontWeight: 500, color: 'var(--text-secondary)' }}>
              1-Tap Ingestion
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Transfer your active calculations ({formatCurrency(todayBalance, month.currencySymbol)} balance) into your primary bank account for live balance tracking.
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
      <div className="account-filter-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                    {hasBreach && <AlertTriangleIcon size={10} color="var(--rose, #f43f5e)" />}
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
                    {hasBreach && <AlertTriangleIcon size={10} color="var(--rose, #f43f5e)" />}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="account-toolbar-actions">
          {isReviewMode ? (
            <span className="review-badge-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px' }}>
              <span>👁️</span> Historical Preview
            </span>
          ) : (
            <button
              type="button"
              className="btn-primary desktop-only-btn"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              onClick={() => onOpenUnifiedEntry?.('log')}
            >
              <PlusIcon size={14} />
              <span>New Entry</span>
            </button>
          )}
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
      </div>

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
            isSalaryCredited={isSalaryAccount
              ? Boolean(activeAccountSummary?.isSalaryCredited)
              : Boolean(simulation?.isSalaryCredited || month?.isSalaryCredited)}
            salaryCreditedDate={isSalaryAccount
              ? (activeAccountSummary?.salaryCreditedDate || null)
              : (simulation?.salaryCreditedDate || month?.salaryCreditedDate || month?.incomeCreditDate || null)}
            canEditSalary={isSalaryAccount || !isFilteringAccount}
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
              onOpenReview={isReviewMode && onOpenReview ? () => onOpenReview(selectedAccountId) : null}
              bankAccounts={bankAccounts}
              wallets={wallets}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* COMPONENT 3: BOTTOM FULL-WIDTH INTERACTIVE TIMELINE */}
      <div className="dashboard-bottom-timeline">
        <ErrorBoundary title="Transactions timeline encountered an issue">
          <TimelineList
            events={activeEvents}
            safetyFloor={activeSafetyFloor}
            currencySymbol={month.currencySymbol}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            currentDay={currentDay}
            month={month}
            selectedAccountId={selectedAccountId}
            selectedAccount={selectedAccount}
            bankAccounts={bankAccounts}
            wallets={wallets}
            onTogglePaid={onTogglePaid}
            onPayTransaction={onPayTransaction}
            onEditTransaction={onEditTransaction}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
