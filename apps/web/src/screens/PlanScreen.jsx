import React, { useState, useMemo, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { playEntrance } from '../components/entranceMotion.js';
import { formatCurrency, formatCurrencyWhole, calculateIrregularMetrics, getHeadroom, summarizeLowPoints, getMonthVerdict } from '@budget/engine';
import {
  DetailedKpiGrid,
  IrregularHeroCards,
  QuarterlyBreakdownTable
} from '../components/SummaryCards.jsx';
import { MonthHealthHero } from '../components/MonthHealthHero.jsx';
import { AllowancePaceMeter } from '../components/AllowancePaceMeter.jsx';
import { UpcomingOutflows } from '../components/UpcomingOutflows.jsx';
import { CategoryBreakdown } from '../components/CategoryBreakdown.jsx';
import { RunwayGauge } from '../components/RunwayGauge.jsx';
import { StepLineChart } from '../components/StepLineChart.jsx';
import { TimelineList } from '../components/TimelineList.jsx';
import { PlusIcon, BuildingLibraryIcon, WalletIcon, ArrowRightLeftIcon, AlertTriangleIcon, EyeIcon } from '../components/Icons.jsx';
import { PageTitle } from '../components/PageTitle.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { liveBalance } from '../utils/liveBalance.js';
import { CashAllocationBar } from '../components/CashAllocationBar.jsx';

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
  onEditTransaction = null,
  onVerdictChange = null
}) {
  const containerRef = useRef(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  // Chart, tiles and timeline sit one tap below the summary; remembered per browser
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try { return localStorage.getItem('plan.detailsOpen') === '1'; } catch { return false; }
  });
  const toggleDetails = () => setDetailsOpen((open) => {
    try { localStorage.setItem('plan.detailsOpen', open ? '0' : '1'); } catch { /* storage blocked */ }
    return !open;
  });
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

  // Selected account metadata with string and altId normalization
  const normSelectedId = String(selectedAccountId || '');
  const selectedBank = useMemo(() => {
    if (!normSelectedId || normSelectedId === 'all') return null;
    return bankAccounts.find((b) => {
      const bid = String(b._id || b.id || '');
      const bAlt = String(b.altId || '');
      return bid === normSelectedId || (bAlt && bAlt === normSelectedId);
    });
  }, [bankAccounts, normSelectedId]);

  const selectedWallet = useMemo(() => {
    if (!normSelectedId || normSelectedId === 'all') return null;
    return wallets.find((w) => {
      const wid = String(w._id || w.id || '');
      const wAlt = String(w.altId || '');
      return wid === normSelectedId || (wAlt && wAlt === normSelectedId);
    });
  }, [wallets, normSelectedId]);

  const selectedAccount = selectedBank || selectedWallet;
  const isFilteringAccount = selectedAccountId !== 'all' && Boolean(selectedAccount);

  const activeSim = useMemo(() => {
    if (isFilteringAccount && accountSimulations?.[selectedAccountId]) {
      return accountSimulations[selectedAccountId];
    }
    return simulation || {};
  }, [isFilteringAccount, accountSimulations, selectedAccountId, simulation]);

  // Root simulation events are the canonical source for all timeline events
  const allSimulationEvents = simulation?.events || [];

  const {
    events: simEvents = [],
    dailyBalances = [],
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
    const acctCurve = [selectedAccountId, selectedAccount?._id, selectedAccount?.id]
      .map((id) => (id ? accountSimulations?.[id]?.dailyBalances : null))
      .find((curve) => curve?.length);
    if (acctCurve) return acctCurve;

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
    if (!isFilteringAccount) return allSimulationEvents.length ? allSimulationEvents : simEvents;

    const designatedSalaryBankId = String(
      month?.salaryBankAccountId?._id ||
      month?.salaryBankAccountId?.id ||
      month?.salaryBankAccountId ||
      ''
    );
    const isDesignatedSalaryBank = Boolean(designatedSalaryBankId && designatedSalaryBankId === normSelectedId);
    const isSoleBank = bankAccounts.length === 1 && selectedBank;

    const alt1 = String(selectedAccount?._id || '');
    const alt2 = String(selectedAccount?.id || '');
    const alt3 = String(selectedAccount?.altId || '');

    const matchesAccount = (rawId) => {
      if (!rawId) return false;
      const idStr = String(rawId);
      return idStr === normSelectedId ||
        (alt1 && idStr === alt1) ||
        (alt2 && idStr === alt2) ||
        (alt3 && idStr === alt3);
    };

    const filteredEvents = allSimulationEvents.filter((ev) => {
      const sBankId = ev.sourceBankAccountId ? String(ev.sourceBankAccountId._id || ev.sourceBankAccountId.id || ev.sourceBankAccountId) : null;
      const sWalletId = ev.sourceWalletId ? String(ev.sourceWalletId._id || ev.sourceWalletId.id || ev.sourceWalletId) : null;
      const dBankId = ev.destinationBankAccountId ? String(ev.destinationBankAccountId._id || ev.destinationBankAccountId.id || ev.destinationBankAccountId) : null;
      const dWalletId = ev.destinationWalletId ? String(ev.destinationWalletId._id || ev.destinationWalletId.id || ev.destinationWalletId) : null;
      const bId = ev.bankAccountId ? String(ev.bankAccountId._id || ev.bankAccountId.id || ev.bankAccountId) : null;
      const wId = ev.walletId ? String(ev.walletId._id || ev.walletId.id || ev.walletId) : null;
      const aId = ev.accountId ? String(ev.accountId._id || ev.accountId.id || ev.accountId) : null;

      if (matchesAccount(aId) || matchesAccount(bId) || matchesAccount(wId)) return true;
      if (matchesAccount(sBankId) || matchesAccount(sWalletId)) return true;
      if (matchesAccount(dBankId) || matchesAccount(dWalletId)) return true;

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

    return filteredEvents.map((ev) => {
      let acctBal = null;
      if (ev.accountBalances) {
        if (ev.accountBalances[normSelectedId] !== undefined) acctBal = ev.accountBalances[normSelectedId];
        else if (alt1 && ev.accountBalances[alt1] !== undefined) acctBal = ev.accountBalances[alt1];
        else if (alt2 && ev.accountBalances[alt2] !== undefined) acctBal = ev.accountBalances[alt2];
        else if (alt3 && ev.accountBalances[alt3] !== undefined) acctBal = ev.accountBalances[alt3];
      }

      if (acctBal === null) {
        if (ev.itemType === 'transfer') {
          const sBankId = ev.sourceBankAccountId ? String(ev.sourceBankAccountId._id || ev.sourceBankAccountId.id || ev.sourceBankAccountId) : null;
          const sWalletId = ev.sourceWalletId ? String(ev.sourceWalletId._id || ev.sourceWalletId.id || ev.sourceWalletId) : null;
          if (matchesAccount(sBankId) || matchesAccount(sWalletId)) {
            acctBal = ev.sourceAccountBalanceAfter;
          } else {
            acctBal = ev.destinationAccountBalanceAfter;
          }
        } else {
          acctBal = ev.accountBalanceAfter;
        }
      }

      return {
        ...ev,
        balanceAfter: acctBal !== null && acctBal !== undefined ? acctBal : ev.balanceAfter,
        globalBalanceAfter: ev.balanceAfter,
        accountBalanceAfter: acctBal !== null && acctBal !== undefined ? acctBal : ev.accountBalanceAfter
      };
    });
  }, [isFilteringAccount, allSimulationEvents, simEvents, normSelectedId, selectedAccount, selectedBank, month, bankAccounts]);

  const hasAccounts = (bankAccounts?.length || 0) > 0 || (wallets?.length || 0) > 0;

  // Account specific metrics with full ID & AltId fallback
  const activeAccountSummary = simulation?.accounts?.[selectedAccountId] ||
    (selectedAccount?._id ? simulation?.accounts?.[selectedAccount._id] : null) ||
    (selectedAccount?.id ? simulation?.accounts?.[selectedAccount.id] : null) ||
    (simulation?.accounts
      ? Object.values(simulation.accounts).find((a) => {
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

  // One floor everywhere: the engine's unified floor = max(month floor, sum of
  // account minimums). Only the single-account view uses that account's minimum.
  const activeSafetyFloor = isFilteringAccount
    ? (selectedAccount?.minimumBalance || 0)
    : (typeof simulation?.safetyFloor === 'number'
      ? simulation.safetyFloor
      : Math.max(month?.safetyFloor || 0, hasAccounts ? totalAccountsSafetyFloor : 0));

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

  // Low points come from the engine's summarizeLowPoints: the true monthly low,
  // the upcoming low (from today) and the first past breach. The old local
  // heuristic dropped past days after an overdraft, hiding a real breach.
  const activeLows = useMemo(() => {
    const src = isFilteringAccount ? activeAccountSummary : simulation;
    if (src && src.lowestBalance !== undefined) {
      return {
        lowest: { balance: src.lowestBalance, date: src.lowestDate || '' },
        upcoming: {
          balance: src.lowestUpcomingBalance !== undefined ? src.lowestUpcomingBalance : src.lowestBalance,
          date: src.lowestUpcomingDate || src.lowestDate || ''
        },
        pastBreach: src.pastBreach || null
      };
    }
    return summarizeLowPoints(activeDailyBalances, {
      currentDay,
      floor: activeSafetyFloor,
      fallbackDate: lowestDate,
      fallbackBalance: lowestBalance
    });
  }, [isFilteringAccount, activeAccountSummary, simulation, activeDailyBalances, currentDay, activeSafetyFloor, lowestDate, lowestBalance]);
  const activeLowestPt = activeLows.lowest;

  const activeFloorBreached = isFilteringAccount
    ? (activeAccountSummary ? activeAccountSummary.floorBreached : activeLowestPt.balance < activeSafetyFloor)
    : floorBreached;

  // Unified sums across all registered bank accounts and wallets (deduplicated by ID)
  const accountsList = useMemo(() => {
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

  // Safe Velocity: isolated for filtered account, unified for all accounts
  const activeSafeVelocity = isFilteringAccount
    ? (activeAccountSummary?.safeVelocity || simulation?.safeVelocity)
    : simulation?.safeVelocity;

  const activeSafeToSpend = isFilteringAccount
    ? (activeAccountSummary?.safeVelocity?.rate ?? safeToSpendPerDay)
    : (simulation?.safeVelocity?.safeVelocityPerDay ?? safeToSpendPerDay);


  // Single source for the figures shared by the hero and the KPI strip
  const activeTodayBalance = isFilteringAccount
    ? (activeAccountSummary?.todayBalance ?? todayBalance)
    : (simulation?.todayBalance ?? unifiedTodayBalance);
  // Forward-looking low (what the user can still act on); past breach shown separately
  const activeLowestBalance = activeLows.upcoming.balance;
  const activeLowestDate = activeLows.upcoming.date;
  const activePastBreach = activeLows.pastBreach;

  // One verdict for the scope being viewed; the header shows the same one.
  const scopeVerdict = month && !isIrregularDashboard
    ? getMonthVerdict({
      lowestBalance: activeLowestBalance,
      safetyFloor: activeSafetyFloor,
      paceStatus: activeSafeVelocity?.paceStatus || activeSafeVelocity?.status || '',
      safeRate: activeSafeVelocity?.safeVelocityPerDay ?? activeSafeVelocity?.rate ?? activeSafeToSpend ?? 0
    })
    : null;
  const scopeName = isFilteringAccount ? (selectedAccount?.name || 'This account') : 'All accounts';
  const verdictKey = scopeVerdict ? `${scopeVerdict.key}|${scopeVerdict.headroom.amount}|${scopeName}` : '';

  useEffect(() => {
    if (!onVerdictChange) return undefined;
    onVerdictChange(scopeVerdict ? { ...scopeVerdict, scope: scopeName } : null);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictKey]);

  useEffect(() => () => { onVerdictChange?.(null); }, [onVerdictChange]);

  // "Today" for the upcoming-payments card: the real date in the current month,
  // the month's first day when planning ahead, and nothing for past months.
  const pad2 = (n) => String(n).padStart(2, '0');
  const realTodayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const monthStartStr = month ? `${month.year}-${pad2(month.month)}-01` : null;
  const upcomingTodayStr = isReviewMode || !month
    ? null
    : isCurrentCalendarMonth
      ? realTodayStr
      : (monthStartStr && monthStartStr > realTodayStr ? monthStartStr : null);

  const handlePayUpcoming = (evt) => {
    const targetId = evt.transactionId || evt.itemId || evt._id || evt.id;
    if (!targetId) return;
    const rawAcc = evt.bankAccountId || evt.walletId || evt.accountId || (selectedAccount?.id || selectedAccount?._id);
    const resolvedAccountId = rawAcc ? (rawAcc.id || rawAcc._id || rawAcc) : null;
    if (onPayTransaction) {
      onPayTransaction(targetId, {
        amount: Math.abs(evt.amount || 0),
        date: realTodayStr,
        accountId: resolvedAccountId ? String(resolvedAccountId) : undefined
      });
    } else if (onTogglePaid) {
      onTogglePaid(targetId, true);
    }
  };

  useGSAP(() => {
    if (!containerRef.current) return undefined;
    return playEntrance(containerRef.current.querySelectorAll('.summary-card, .plan-insight-card, .dashboard-chart-panel'));
  }, { dependencies: [selectedAccountId, viewSubmode, timeframe], scope: containerRef });

  if (isIrregularDashboard) {
    const quarters = irregularMetrics.quarterly || [];
    const yearly = irregularMetrics.yearly || [];

    return (
      <div className="dashboard-layout" ref={containerRef}>
        {/* Dual Mode Switcher if user has both salary & irregular */}
        {settings?.incomeMode === 'both' && month && (
          <div className="plan-row">
            <div className="plan-row-2">
              <button
                type="button"
                onClick={() => setViewSubmode('monthly')}
                className={`filter-pill ${viewSubmode === 'monthly' ? 'active' : ''} plan-btn`}
              >
                Monthly Budget
              </button>
              <button
                type="button"
                onClick={() => setViewSubmode('irregular')}
                className={`filter-pill ${viewSubmode === 'irregular' ? 'active' : ''} plan-btn`}
              >
                Irregular income
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
                <span>{b.name} ({formatCurrency(b.currentBalance ?? b.openingBalance, currencySymbol)})</span>
              </button>
            ))}
            {wallets.map((w) => (
              <button
                key={w._id || w.id}
                type="button"
                className={`filter-pill account-filter-pill ${selectedAccountId === (w._id || w.id) ? 'active' : ''}`}
                onClick={() => setSelectedAccountId(w._id || w.id)}
              >
                <span>{w.name} ({formatCurrency(w.currentBalance ?? w.openingBalance, currencySymbol)})</span>
              </button>
            ))}
          </div>

          {!isReviewMode && (
            <div className="desktop-only-btn plan-row-3">
              <button
                type="button"
                className="btn-primary plan-btn-2"
                onClick={() => onOpenUnifiedEntry('income')}
              >
                + Log Income
              </button>
              <button
                type="button"
                className="btn-secondary plan-btn-2"
                onClick={() => onOpenUnifiedEntry('log')}
              >
                - Log Expense
              </button>
              <button
                type="button"
                className="btn-secondary plan-btn-2"
                onClick={() => onOpenUnifiedEntry('transfer')}
              >
                <ArrowRightLeftIcon size={12} /> Transfer
              </button>
            </div>
          )}
        </div>

        {/* Runway first: the planner's headline measure for irregular income */}
        <RunwayGauge
          runwayMonths={irregularMetrics.runwayMonths}
          isIndefinite={irregularMetrics.isIndefinite}
          currentBalance={irregularMetrics.currentBalance}
          avgMonthlySpending={irregularMetrics.avgMonthlySpending}
          monthsOfHistory={irregularMetrics.monthsOfHistory ?? null}
          currencySymbol={currencySymbol}
        />

        {/* Smoothed income, average spending, savings rate, liquid balance */}
        <IrregularHeroCards metrics={irregularMetrics} currencySymbol={currencySymbol} />

        {/* Timeframe Selector & Report Content */}
        <div className="card plan-box">
          <div className="plan-row-4">
            <div>
              <h3 className="plan-heading">
                Cashflow & Earnings Analysis
              </h3>
              <p className="plan-text">
                Income and spending averaged over the months you have recorded.
              </p>
            </div>

            <div className="plan-row-2">
              <button
                type="button"
                className={`filter-pill ${timeframe === 'trailing12m' ? 'active' : ''} plan-btn`}
                onClick={() => setTimeframe('trailing12m')}
              >
                Trailing 12M
              </button>
              <button
                type="button"
                className={`filter-pill ${timeframe === 'quarterly' ? 'active' : ''} plan-btn`}
                onClick={() => setTimeframe('quarterly')}
              >
                Quarterly
              </button>
              <button
                type="button"
                className={`filter-pill ${timeframe === 'ytd' ? 'active' : ''} plan-btn`}
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
            <div className="irr-two-col">
              <div className="plan-box-2">
                <span className="plan-note">
                  Trailing 12-Month Inflow
                </span>
                <div className="plan-text-2">
                  +{formatCurrency(irregularMetrics.trailing12mIncome, currencySymbol)}
                </div>
                <div className="plan-note-2">
                  Smoothed Monthly: {formatCurrency(irregularMetrics.smoothedMonthlyIncome, currencySymbol)} / mo
                </div>
              </div>

              <div className="plan-box-2">
                <span className="plan-note">
                  Trailing 12-Month Outflow
                </span>
                <div className="plan-text-3">
                  -{formatCurrency(irregularMetrics.trailing12mSpending, currencySymbol)}
                </div>
                <div className="plan-note-2">
                  Average Burn: {formatCurrency(irregularMetrics.avgMonthlySpending, currencySymbol)} / mo
                </div>
              </div>
            </div>
          )}

          {timeframe === 'ytd' && (
            <div className="plan-box-3">
              {yearly.length === 0 ? (
                <div className="plan-note-3">
                  No yearly transaction records found.
                </div>
              ) : (
                <table className="irr-table">
                  <thead>
                    <tr className="plan-text-4">
                      <th className="plan-box-4">Year</th>
                      <th className="plan-box-4">Total Inflow</th>
                      <th className="plan-box-4">Total Outflow</th>
                      <th className="plan-box-4">Net Cashflow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearly.map((y) => (
                      <tr className="plan-box-5" key={y.key}>
                        <td className="plan-text-5">{y.year}</td>
                        <td className="plan-text-6">+{formatCurrency(y.income, currencySymbol)}</td>
                        <td className="plan-box-4">-{formatCurrency(y.spending, currencySymbol)}</td>
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
          <div className="card plan-row-5">
            <div>
              <span className="plan-note-4">Receive a fixed regular salary?</span>
              <p className="plan-text-7">
                You can configure a monthly salary template to automate recurring pay and monthly budget horizons.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary plan-btn-3"
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
          className="card plan-stack"
        >
          <div className="plan-row-6">
            <div className="plan-row-7">
              <BuildingLibraryIcon size={18} />
              <span className="plan-text-8">
                Move your balance into a bank account
              </span>
            </div>
            <span className="plan-note-5">
              One step
            </span>
          </div>
          <p className="plan-text-9">
            Move your current balance ({formatCurrency(todayBalance, month.currencySymbol)}) into your main bank account so it updates as you spend.
          </p>
          <div className="plan-row-8">
            <button
              type="button"
              className="btn-primary plan-btn-4"
              onClick={onOpenMigration}
            >
              Move my balance
            </button>
          </div>
        </div>
      )}

      <PageTitle title="Plan" />

      {/* Account Filter & Action Toolbar */}
      <div className="account-filter-wrapper plan-stack-2">
        <div className="account-filter-bar">
        <div className="account-filter-track">
          {hasAccounts && (
            <>
              <button
                type="button"
                className={`filter-pill account-filter-pill ${selectedAccountId === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedAccountId('all')}
              >
                <span>All</span>
                <span className="tabular-nums" style={{ opacity: selectedAccountId === 'all' ? 1 : 0.8, fontWeight: 700 }}>
                  {formatCurrencyWhole(
                    [...bankAccounts, ...wallets].reduce((sum, a) => sum + liveBalance(a, simulation?.accounts?.[a._id || a.id], month), 0),
                    month.currencySymbol
                  )}
                </span>
              </button>

              {bankAccounts.map((b) => {
                const accId = b._id || b.id;
                const isSelected = selectedAccountId === accId;
                const accSim = simulation?.accounts?.[accId];
                const bal = liveBalance(b, accSim, month);
                const hasBreach = accSim?.floorBreached;
                const minBal = Number(b.minimumBalance) || 0;
                const headroom = minBal > 0 ? getHeadroom(bal, minBal) : null;

                return (
                  <button
                    key={accId}
                    type="button"
                    className={`filter-pill account-filter-pill ${isSelected ? 'active' : ''} ${hasBreach ? 'breached' : ''} ${headroom ? 'has-headroom' : ''}`}
                    onClick={() => setSelectedAccountId(accId)}
                    title={headroom
                      ? `${formatCurrency(Math.abs(headroom.amount), month.currencySymbol)} ${headroom.amount < 0 ? 'below' : 'above'} its ${formatCurrency(minBal, month.currencySymbol)} minimum`
                      : undefined}
                  >
                    <BuildingLibraryIcon size={12} />
                    <span>{b.name}</span>
                    <span className="tabular-nums" style={{ opacity: isSelected ? 1 : 0.8, fontWeight: 700 }}>
                      {formatCurrencyWhole(bal, month.currencySymbol)}
                    </span>
                    {hasBreach && <AlertTriangleIcon size={10} color="var(--rose)" />}
                    {headroom && (
                      <span
                        className={`pill-headroom headroom-${headroom.status}`}
                        style={{ width: `${Math.max(6, headroom.ratio * 100)}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}

              {wallets.map((w) => {
                const accId = w._id || w.id;
                const isSelected = selectedAccountId === accId;
                const accSim = simulation?.accounts?.[accId];
                const bal = liveBalance(w, accSim, month);
                const hasBreach = accSim?.floorBreached;
                const minBal = Number(w.minimumBalance) || 0;
                const headroom = minBal > 0 ? getHeadroom(bal, minBal) : null;

                return (
                  <button
                    key={accId}
                    type="button"
                    className={`filter-pill account-filter-pill ${isSelected ? 'active' : ''} ${hasBreach ? 'breached' : ''} ${headroom ? 'has-headroom' : ''}`}
                    onClick={() => setSelectedAccountId(accId)}
                    title={headroom
                      ? `${formatCurrency(Math.abs(headroom.amount), month.currencySymbol)} ${headroom.amount < 0 ? 'below' : 'above'} its ${formatCurrency(minBal, month.currencySymbol)} minimum`
                      : undefined}
                  >
                    <WalletIcon size={12} />
                    <span>{w.name}</span>
                    <span className="tabular-nums" style={{ opacity: isSelected ? 1 : 0.8, fontWeight: 700 }}>
                      {formatCurrencyWhole(bal, month.currencySymbol)}
                    </span>
                    {hasBreach && <AlertTriangleIcon size={10} color="var(--rose)" />}
                    {headroom && (
                      <span
                        className={`pill-headroom headroom-${headroom.status}`}
                        style={{ width: `${Math.max(6, headroom.ratio * 100)}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="account-toolbar-actions">
          {isReviewMode && (
            <span className="review-badge-tag plan-row-9">
              <EyeIcon size={13} /> Historical Preview
            </span>
          )}
        </div>
      </div>

      {/* Account Isolated Notification Pill */}
      {isFilteringAccount && (
        <div className="plan-row-10"
        >
          <div className="plan-row-7">
            {selectedBank ? <BuildingLibraryIcon size={13} /> : <WalletIcon size={13} />}
            <span>
              Showing only <strong>{selectedAccount.name}</strong>
            </span>
          </div>
          <button
            type="button"
            className="btn-subtle plan-btn-6"
            onClick={() => setSelectedAccountId('all')}
          >
            Reset
          </button>
        </div>
      )}
      </div>

      {/* At a glance: one number, then what's due. Everything else is one tap deeper. */}
      <div className="plan-glance">
        <MonthHealthHero
          safeVelocity={activeSafeVelocity}
          daysLeft={daysLeft}
          safeToSpendPerDay={activeSafeToSpend}
          lowestBalance={activeLowestBalance}
          safetyFloor={activeSafetyFloor}
          verdict={scopeVerdict}
          currencySymbol={month.currencySymbol}
          dailyBalances={activeDailyBalances}
          currentDay={currentDay}
          detailsOpen={detailsOpen}
          onToggleDetails={toggleDetails}
        />

      <ErrorBoundary title="Upcoming payments unavailable">
        <UpcomingOutflows
          events={activeEvents}
          todayStr={upcomingTodayStr}
          currencySymbol={month.currencySymbol}
          isReviewMode={isReviewMode}
          onPay={onPayTransaction || onTogglePaid ? handlePayUpcoming : null}
          title="Due soon"
          maxRows={3}
        />
      </ErrorBoundary>
      </div>

      <button
        type="button"
        className="plan-details-toggle"
        onClick={toggleDetails}
        aria-expanded={detailsOpen}
        aria-controls="plan-details"
      >
        {detailsOpen ? 'Hide details' : 'Details'}
        <span aria-hidden="true" className={`plan-details-chev ${detailsOpen ? 'open' : ''}`}>›</span>
      </button>

      {detailsOpen && (
      <div id="plan-details" className="plan-details">
      <div className="dashboard-top-grid">
        <div className="dashboard-insights-panel">
          <CashAllocationBar
            todayBalance={activeTodayBalance}
            committedUpcomingItems={activeSafeVelocity?.committedUpcomingItems ?? activeSafeVelocity?.committedBills ?? 0}
            safetyFloor={activeSafetyFloor}
            goalReserve={activeSafeVelocity?.goalReserve ?? 0}
            heldReserve={activeSafeVelocity?.heldReserve ?? 0}
            cardReserve={activeSafeVelocity?.cardReserve ?? 0}
            freeSurplus={activeSafeVelocity?.freeSurplus}
            currencySymbol={month.currencySymbol}
          />
          <DetailedKpiGrid
            incomeAmount={isFilteringAccount ? (activeAccountSummary?.incomeAmount ?? 0) : unifiedIncome}
            incomeCreditDay={month.incomeCreditDay}
            events={activeEvents}
            totalExpenses={isFilteringAccount ? activeAccountSummary?.totalExpenses : simulation?.totalExpenses}
            lowestBalance={activeLowestBalance}
            lowestDate={activeLowestDate}
            pastBreach={activePastBreach}
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

        <div className="dashboard-chart-panel">
          <ErrorBoundary title="Chart unavailable">
            <StepLineChart
              dailyBalances={activeDailyBalances}
              events={activeEvents}
              safetyFloor={activeSafetyFloor}
              currencySymbol={month.currencySymbol}
              floorBreached={activeFloorBreached}
              lowestDate={activeLowestPt.date}
              upcomingLow={activeLows.upcoming}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              currentDay={currentDay}
              onOpenReview={isReviewMode && onOpenReview ? () => onOpenReview(selectedAccountId) : null}
              selectedAccountId={selectedAccountId}
              selectedAccount={selectedAccount}
              safeDailyRate={activeSafeToSpend}
            />
          </ErrorBoundary>
        </div>
      </div>

      <div className="plan-insights-row">
        <ErrorBoundary title="Allowance pace unavailable">
          <AllowancePaceMeter
            unplannedAllowance={activeSim?.unplannedAllowance ?? 0}
            totalUnplannedSpent={activeSim?.totalUnplannedSpent ?? 0}
            daysElapsed={activeSim?.daysElapsed ?? simulation?.daysElapsed ?? 1}
            daysInMonth={activeSim?.daysInMonth ?? simulation?.daysInMonth ?? (activeDailyBalances.length || 30)}
            currencySymbol={month.currencySymbol}
          />
        </ErrorBoundary>
        <ErrorBoundary title="Category breakdown unavailable">
          <CategoryBreakdown events={activeEvents} currencySymbol={month.currencySymbol} />
        </ErrorBoundary>
      </div>

      {/* COMPONENT 3: BOTTOM FULL-WIDTH INTERACTIVE TIMELINE */}
      <div className="dashboard-bottom-timeline">
        <ErrorBoundary title="Transactions timeline encountered an issue">
          <TimelineList
            events={activeEvents}
            items={items}
            transactions={transactions}
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
      )}
    </div>
  );
}
