import React, { useState, useEffect, useMemo } from 'react';
import { api } from './api.js';
import { simulate } from '@budget/engine';
import { Header } from './components/Header.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { PlanScreen } from './screens/PlanScreen.jsx';
import { TransactionsScreen } from './screens/TransactionsScreen.jsx';
import { ItemsScreen } from './screens/ItemsScreen.jsx';
import { GoalsScreen } from './screens/GoalsScreen.jsx';
import { AccountsScreen } from './screens/AccountsScreen.jsx';
import { AssistantScreen } from './screens/AssistantScreen.jsx';
import { UnifiedEntryModal } from './components/UnifiedEntryModal.jsx';
import { MonthEndReviewModal } from './components/MonthEndReviewModal.jsx';
import { SalarySafelineModal } from './components/SalarySafelineModal.jsx';
import { TransferCalculationsModal } from './components/TransferCalculationsModal.jsx';
import { MonthRolloverModal } from './components/MonthRolloverModal.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';
import { OnboardingModal } from './components/OnboardingModal.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

import { AnimatedLogo } from './components/AnimatedLogo.jsx';

export function resolveEntryModeFromItem(item) {
  if (!item) return 'log';
  if (item.type === 'income' || item.direction === 'income' || Boolean(item.isIncome)) {
    return 'income';
  }
  if (item.origin === 'transfer' || Boolean(item.isTransfer)) {
    return 'transfer';
  }
  if (item.origin === 'spot' || ((!item.status || item.status === 'successful') && item.type !== 'one-time' && item.type !== 'recurring')) {
    return 'log';
  }
  return 'plan';
}

export default function App() {
  // Theme state: system | light | dark
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('budget_theme') || 'system');

  useEffect(() => {
    localStorage.setItem('budget_theme', themeMode);

    const applyResolvedTheme = () => {
      let resolved = themeMode;
      if (themeMode === 'system') {
        const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = isDark ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
    };

    applyResolvedTheme();

    if (themeMode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyResolvedTheme();
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(listener);
        return () => mediaQuery.removeListener(listener);
      }
    }
  }, [themeMode]);

  const cycleTheme = () => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  // Auth & Settings state
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Month & Items state
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(null);
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [activeTab, setActiveTab] = useState('plan');


  // Modals state
  const [unifiedEntryOpen, setUnifiedEntryOpen] = useState(false);
  const [unifiedEntryMode, setUnifiedEntryMode] = useState('log'); // 'log' | 'plan'
  const [editingItem, setEditingItem] = useState(null);
  const [autoOpenAddBank, setAutoOpenAddBank] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAccountId, setReviewAccountId] = useState('all');
  const [isSalarySafelineOpen, setIsSalarySafelineOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [rolloverModalOpen, setRolloverModalOpen] = useState(false);

  // Review mode & active cycle derivation
  const isReviewMode = useMemo(() => {
    if (!currentMonth) return false;
    // Requirement: The review should strictly only be applicable for previous months and not the active months.
    // If any active month is ongoing, it should not offer the read-only review.
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isOngoingOrFuture = currentMonth.endDate
      ? currentMonth.endDate >= todayIso
      : (currentMonth.year > now.getFullYear() || (currentMonth.year === now.getFullYear() && currentMonth.month >= (now.getMonth() + 1)));

    if (isOngoingOrFuture) {
      return false;
    }

    return Boolean(currentMonth.isClosed);
  }, [currentMonth]);

  const activePlanningMonth = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    return months.find((m) => {
      const isPast = m.endDate
        ? m.endDate < todayIso
        : (m.year < currentYear || (m.year === currentYear && m.month < currentMonthNum));
      const isFuture = (m.startDate && m.startDate > todayIso) ||
        (m.year > currentYear || (m.year === currentYear && m.month > currentMonthNum));
      return !isPast && !isFuture && !m.isClosed;
    }) || null;
  }, [months]);

  const nextMonthLabel = useMemo(() => {
    if (!currentMonth) return 'Next Month';
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    let nextM = Number(currentMonth.month) + 1;
    let nextY = Number(currentMonth.year);
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    return `${monthNames[nextM - 1]} ${nextY}`;
  }, [currentMonth]);

  const handleRolloverSubmit = async (carryBalance = true, rolloverUnpaid = true) => {
    if (!currentMonth) return;
    setDataLoading(true);
    try {
      const res = await api.rolloverMonth(currentMonth.year, currentMonth.month, carryBalance, rolloverUnpaid);
      const list = await api.getMonths();
      setMonths(list || []);
      const target = res?.month || res?.data?.month || (list && list.find((m) => !m.isClosed)) || list?.[0];
      if (target) {
        await loadMonthDetails(target.year, target.month);
        await loadGoals(target.year, target.month);
      }
      await loadAccounts();
      setRolloverModalOpen(false);
    } catch (err) {
      alert(err.message || 'Failed to roll over month');
      throw err;
    } finally {
      setDataLoading(false);
    }
  };

  // Migration state
  const [migrationEligible, setMigrationEligible] = useState(false);
  const [migrationStats, setMigrationStats] = useState(null);

  // Initial user session fetch
  useEffect(() => {
    api.getMe()
      .then((res) => {
        if (res.user) {
          setUser(res.user);
          setSettings(res.settings);
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  // Fetch months when user logs in
  const loadMonths = async (selectYear = null, selectMonth = null) => {
    setDataLoading(true);
    try {
      const list = await api.getMonths();
      setMonths(list);
      if (list.length > 0) {
        let target = null;
        if (selectYear && selectMonth) {
          target = list.find((m) => m.year === selectYear && m.month === selectMonth);
        }
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const currentYear = now.getFullYear();
        const currentMonthNum = now.getMonth() + 1;

        // 1. Prefer ongoing active cycle containing today (not future)
        if (!target) {
          target = list.find((m) => !m.isClosed && m.startDate && m.endDate && m.startDate <= todayIso && m.endDate >= todayIso && !(m.year > currentYear || (m.year === currentYear && m.month > currentMonthNum)));
        }
        // 2. Next check current calendar month
        if (!target) {
          target = list.find((m) => !m.isClosed && m.year === currentYear && m.month === currentMonthNum);
        }
        // 3. Next prefer any active (unclosed) planning month that is not in future
        if (!target) {
          target = list.find((m) => !m.isClosed && !(m.startDate && m.startDate > todayIso) && !(m.year > currentYear || (m.year === currentYear && m.month > currentMonthNum)));
        }
        // 4. Fallback to latest available non-future month
        if (!target) {
          target = list.find((m) => m.year < currentYear || (m.year === currentYear && m.month <= currentMonthNum)) || list[0];
        }
        await loadMonthDetails(target.year, target.month);
      } else {
        setCurrentMonth(null);
        setItems([]);
        setGoals([]);
        try {
          const globalTxs = await api.getGlobalTransactions();
          setTransactions(globalTxs || []);
        } catch (_) {
          setTransactions([]);
        }
      }
    } catch (err) {
      console.error('Failed to load months:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const loadGoals = async (year, monthNum) => {
    try {
      const list = await api.getGoals(year, monthNum);
      setGoals(list);
    } catch (err) {
      console.error('Failed to load goals:', err);
    }
  };

  const [serverSimulation, setServerSimulation] = useState(() => {
    try {
      const cached = localStorage.getItem('budget_cached_simulation');
      return cached ? JSON.parse(cached) : null;
    } catch (_) {
      return null;
    }
  });
  const [serverAccountSimulations, setServerAccountSimulations] = useState(() => {
    try {
      const cached = localStorage.getItem('budget_cached_acc_simulations');
      return cached ? JSON.parse(cached) : {};
    } catch (_) {
      return {};
    }
  });

  const loadMonthDetails = async (year, monthNum) => {
    setDataLoading(true);
    try {
      const res = await api.getMonthDetail(year, monthNum);
      setCurrentMonth(res.month);
      setItems(res.items);
      setTransactions(res.transactions || []);
      setTransfers(res.transfers || []);
      setBankAccounts(res.bankAccounts || []);
      setWallets(res.wallets || []);

      if (res.simulation) {
        setServerSimulation(res.simulation);
        try {
          localStorage.setItem('budget_cached_simulation', JSON.stringify(res.simulation));
        } catch (_) {}
      }
      if (res.accountSimulations) {
        setServerAccountSimulations(res.accountSimulations);
        try {
          localStorage.setItem('budget_cached_acc_simulations', JSON.stringify(res.accountSimulations));
        } catch (_) {}
      }

      await loadGoals(year, monthNum);
    } catch (err) {
      console.error('Failed to load month details:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const [banks, wals] = await Promise.all([
        api.getBankAccounts(),
        api.getWallets()
      ]);
      setBankAccounts(banks || []);
      setWallets(wals || []);
      setAccountsLoaded(true);
    } catch (err) {
      console.error('Failed to load accounts:', err);
      setAccountsLoaded(true);
    }
  };

  const checkMigrationEligibility = async () => {
    try {
      const res = await api.getMigrationStatus();
      if (res && res.eligible) {
        setMigrationEligible(true);
        setMigrationStats(res.stats);
      } else {
        setMigrationEligible(false);
        setMigrationStats(null);
      }
    } catch (err) {
      console.error('Failed to check migration eligibility:', err);
    }
  };

  const handleMigrated = async (accountDetails) => {
    try {
      await api.migrateLegacyData(accountDetails);
      setMigrationEligible(false);
      setMigrationStats(null);
      const updatedAccounts = await api.getBankAccounts();
      setBankAccounts(updatedAccounts);
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      } else {
        await loadMonths();
      }
    } catch (err) {
      console.error('Failed to reload data post-migration:', err);
      alert(err.message || 'Failed to link account and migrate legacy data');
      throw err;
    }
  };

  useEffect(() => {
    if (user) {
      loadAccounts();
      loadMonths();
      checkMigrationEligibility();
    }
  }, [user]);

  // Server-Authoritative simulation calculation with offline fallback
  const activeSimulation = useMemo(() => {
    if (serverSimulation) {
      return serverSimulation;
    }
    if (!currentMonth) return null;

    const now = new Date();
    const currentYearMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const viewingYearMonth = Number(currentMonth.year) * 12 + Number(currentMonth.month);

    let currentDay = null;
    if (viewingYearMonth === currentYearMonth) {
      currentDay = now.getDate();
    } else if (viewingYearMonth < currentYearMonth) {
      currentDay = null;
    } else {
      currentDay = 0;
    }

    return simulate(
      {
        openingBalance: currentMonth.openingBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDay: currentMonth.incomeCreditDay,
        incomeCreditDate: currentMonth.incomeCreditDate,
        salaryBankAccountId: currentMonth.salaryBankAccountId,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currentDay,
        scale: 100,
        accounts: { bankAccounts, wallets },
        accountOpeningBalances: currentMonth.accountOpeningBalances || [],
        transfers
      },
      [], // Unified transactions is the sole source of truth
      { year: currentMonth.year, month: currentMonth.month },
      transactions,
      goals,
      transfers,
      [
        ...bankAccounts.map((b) => ({ ...b, type: 'bank' })),
        ...wallets.map((w) => ({ ...w, type: 'wallet' }))
      ]
    );
  }, [serverSimulation, currentMonth, items, transactions, goals, transfers, bankAccounts, wallets]);

  // Auth actions
  const handleLogin = async (email, password) => {
    const res = await api.login(email, password);
    setUser(res.user);
    const s = await api.getSettings();
    setSettings(s);
  };

  const handleRegister = async (email, password) => {
    const res = await api.register(email, password);
    setUser(res.user);
    const s = await api.getSettings();
    setSettings(s);
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setCurrentMonth(null);
    setMonths([]);
    setItems([]);
    setTransactions([]);
    setBankAccounts([]);
    setWallets([]);
    setAccountsLoaded(false);
    setGoals([]);
    setTransfers([]);
    setMigrationEligible(false);
    setMigrationStats(null);
    setMigrationModalOpen(false);
    sessionStorage.removeItem('budget_migration_dismissed');
  };


  // Transaction entry actions
  const handleLogTransaction = async (txData, underSpendAction = null) => {
    try {
      let created;
      if (editingItem) {
        const editingId = editingItem.id || editingItem._id;
        created = await api.updateTransaction(editingId, txData);
        setTransactions((prev) => prev.map((t) => ((t.id || t._id) === editingId ? { ...t, ...created } : t)));
        setItems((prev) => prev.map((i) => ((i.id || i._id) === editingId ? { ...i, ...created } : i)));
      } else if (currentMonth) {
        created = await api.createTransaction(currentMonth.year, currentMonth.month, txData);
        setTransactions((prev) => [...prev, created]);
      } else {
        created = await api.createGlobalTransaction(txData);
        setTransactions((prev) => [...prev, created]);
      }

      if (underSpendAction && txData.plannedItemId && currentMonth) {
        const targetItem = items.find((i) => i._id === txData.plannedItemId);
        if (targetItem) {
          if (underSpendAction.type === 'release') {
            const updated = await api.updateItem(targetItem._id, {
              amount: underSpendAction.spentAmt,
              isPaid: true
            });
            setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
          } else if (underSpendAction.type === 'keep_remainder') {
            const updated = await api.updateItem(targetItem._id, {
              amount: underSpendAction.spentAmt,
              isPaid: true
            });
            const newItemData = {
              type: targetItem.type,
              name: `${targetItem.name} (Remainder)`,
              amount: underSpendAction.remainderAmt,
              priority: targetItem.priority,
              isPaid: false,
              accountType: targetItem.accountType,
              bankAccountId: targetItem.bankAccountId?._id || targetItem.bankAccountId,
              walletId: targetItem.walletId?._id || targetItem.walletId
            };
            if (targetItem.type === 'one-time') {
              newItemData.day = targetItem.day;
            } else if (targetItem.type === 'recurring') {
              newItemData.dayOfMonth = targetItem.dayOfMonth;
              newItemData.isFixed = targetItem.isFixed;
            }
            const remainderItem = await api.createItem(currentMonth.year, currentMonth.month, newItemData);
            setItems((prev) => [...prev.map((i) => (i._id === updated._id ? updated : i)), remainderItem]);
          }
        }
      } else if (txData.plannedItemId && currentMonth) {
        setItems((prev) => prev.map((i) => (i._id === txData.plannedItemId ? { ...i, isPaid: true } : i)));
      }

      setUnifiedEntryOpen(false);
      if (currentMonth) {
        await Promise.all([
          loadMonthDetails(currentMonth.year, currentMonth.month),
          loadAccounts()
        ]);
      } else {
        const [globalTxs] = await Promise.all([
          api.getGlobalTransactions(),
          loadAccounts()
        ]);
        setTransactions(globalTxs || []);
      }
      return created;
    } catch (err) {
      alert(err.message || 'Failed to log transaction');
      throw err;
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => (t.id || t._id) !== id));
      if (currentMonth) {
        await Promise.all([
          loadMonthDetails(currentMonth.year, currentMonth.month),
          loadAccounts()
        ]);
      } else {
        const [globalTxs] = await Promise.all([
          api.getGlobalTransactions(),
          loadAccounts()
        ]);
        setTransactions(globalTxs || []);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete transaction');
    }
  };

  const handlePayTransaction = async (txId, payData) => {
    try {
      const res = await api.payTransaction(txId, payData);
      
      // Reload months to reflect any cycle advancement
      const list = await api.getMonths();
      setMonths(list || []);

      const advanced = res?.advancedMonth || (res?.data?.advancedMonth);
      const targetMonth = advanced || (list && list.find((m) => !m.isClosed));

      if (targetMonth) {
        await Promise.all([
          loadMonthDetails(targetMonth.year, targetMonth.month),
          loadGoals(targetMonth.year, targetMonth.month),
          loadAccounts()
        ]);
      } else if (currentMonth) {
        await Promise.all([
          loadMonthDetails(currentMonth.year, currentMonth.month),
          loadGoals(currentMonth.year, currentMonth.month),
          loadAccounts()
        ]);
      } else {
        const [globalTxs] = await Promise.all([
          api.getGlobalTransactions(),
          loadAccounts()
        ]);
        setTransactions(globalTxs || []);
      }
    } catch (err) {
      alert(err.message || 'Failed to settle transaction');
      throw err;
    }
  };

  const handleCancelTransaction = async (txId, cancelData) => {
    try {
      await api.cancelTransaction(txId, cancelData);
      if (currentMonth) {
        await Promise.all([
          loadMonthDetails(currentMonth.year, currentMonth.month),
          loadGoals(currentMonth.year, currentMonth.month),
          loadAccounts()
        ]);
      } else {
        const [globalTxs] = await Promise.all([
          api.getGlobalTransactions(),
          loadAccounts()
        ]);
        setTransactions(globalTxs || []);
      }
    } catch (err) {
      alert(err.message || 'Failed to cancel transaction');
      throw err;
    }
  };

  // Item actions
  const handleSaveItem = async (itemData) => {
    try {
      let result;
      if (editingItem) {
        const editingId = editingItem.id || editingItem._id;
        result = await api.updateTransaction(editingId, itemData);
        setTransactions((prev) => prev.map((t) => ((t.id || t._id) === editingId ? { ...t, ...result } : t)));
        setItems((prev) => prev.map((i) => ((i.id || i._id) === editingId ? { ...i, ...result } : i)));
        await loadAccounts();
      } else if (currentMonth) {
        result = await api.createItem(currentMonth.year, currentMonth.month, itemData);
      } else {
        const txData = {
          title: itemData.name || itemData.title,
          amount: itemData.amount,
          direction: itemData.direction || (itemData.isIncome ? 'income' : 'expense'),
          status: 'planned',
          date: itemData.date || new Date().toISOString().split('T')[0],
          accountType: itemData.accountType || 'bank',
          bankAccountId: itemData.bankAccountId,
          walletId: itemData.walletId,
          category: itemData.category || itemData.name
        };
        result = await api.createGlobalTransaction(txData);
        const globalTxs = await api.getGlobalTransactions();
        setTransactions(globalTxs || []);
      }
      setUnifiedEntryOpen(false);
      setEditingItem(null);
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      }
      return result;
    } catch (err) {
      alert(err.message || 'Failed to save item');
      throw err;
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('Delete this item from the month?')) return;
    try {
      await api.deleteItem(id);
      setItems((prev) => prev.filter((i) => i._id !== id));
      await loadMonthDetails(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to delete item');
    }
  };

  const handleTogglePaid = async (id, isPaid) => {
    try {
      const updated = await api.updateItem(id, { isPaid });
      await loadMonthDetails(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to update payment status');
    }
  };

  const handleDeleteMonth = async (delYear, delMonth, force = false) => {
    try {
      await api.deleteMonth(delYear, delMonth, force);
      const remaining = months.filter((m) => !(m.year === delYear && m.month === delMonth));
      setMonths(remaining);

      // If deleted month was currently viewed, transition to nearest remaining month
      if (currentMonth && currentMonth.year === delYear && currentMonth.month === delMonth) {
        if (remaining.length > 0) {
          // Prefer current calendar month, else remaining[0]
          const currentCal = remaining.find((m) => m.year === now.getFullYear() && m.month === (now.getMonth() + 1));
          const target = currentCal || remaining[0];
          await loadMonthDetails(target.year, target.month);
        } else {
          setCurrentMonth(null);
          setItems([]);
          setTransactions([]);
          setTransfers([]);
          setGoals([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete month:', err);
      alert(err.message || 'Failed to delete month');
    }
  };

  const handleSaveMonthSettings = async (updates) => {
    try {
      const res = await api.updateMonth(currentMonth.year, currentMonth.month, updates);
      if (updates.salaryBankAccountId !== undefined) {
        api.updateSettings({ defaultSalaryBankAccountId: updates.salaryBankAccountId }).catch(() => {});
      }
      await loadMonthDetails(res.month.year, res.month.month);
      await loadAccounts();
    } catch (err) {
      alert(err.message || 'Failed to update month settings');
    }
  };

  const handleSaveDefaults = async (updates) => {
    try {
      const updated = await api.updateSettings(updates);
      setSettings(updated);
    } catch (err) {
      alert(err.message || 'Failed to update defaults');
    }
  };

  const handleCreateGoal = async (data) => {
    try {
      await api.createGoal(currentMonth.year, currentMonth.month, data);
      await loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to create goal');
    }
  };

  const handleScheduleGoal = async (goalId, scheduledDate) => {
    try {
      await api.scheduleGoal(goalId, scheduledDate ? { scheduledDate } : {});
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
        await loadAccounts();
        await loadGoals(currentMonth.year, currentMonth.month);
      }
    } catch (err) {
      alert(err.message || 'Failed to schedule goal');
      throw err;
    }
  };

  const handleConvertGoalToItem = async (goalId) => {
    return handleScheduleGoal(goalId);
  };

  const handleDeferGoal = async (goalId) => {
    try {
      await api.deferGoal(goalId);
      await loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to defer goal');
    }
  };

  const handleReactivateGoal = async (goalId) => {
    try {
      await api.reactivateGoal(goalId);
      await loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to reactivate goal');
    }
  };

  const handleDeleteGoal = async (goalId) => {
    try {
      await api.deleteGoal(goalId);
      await loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to delete goal');
    }
  };

  // Bank Account handlers
  const handleSaveBankAccount = async (data) => {
    try {
      let createdOrUpdated;
      if (data.id) {
        createdOrUpdated = await api.updateBankAccount(data.id, data);
      } else {
        createdOrUpdated = await api.createBankAccount(data);
      }
      await loadAccounts();
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      }
      return createdOrUpdated;
    } catch (err) {
      alert(err.message || 'Failed to save bank account');
      throw err;
    }
  };

  const handleArchiveBankAccount = async (id) => {
    if (!window.confirm('Are you sure you want to archive this bank account? Historical records will be preserved.')) return;
    try {
      await api.deleteBankAccount(id);
      await loadAccounts();
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      }
    } catch (err) {
      alert(err.message || 'Failed to archive bank account');
    }
  };

  // Wallet handlers
  const handleSaveWallet = async (data) => {
    try {
      let createdOrUpdated;
      if (data.id) {
        createdOrUpdated = await api.updateWallet(data.id, data);
      } else {
        createdOrUpdated = await api.createWallet(data);
      }
      await loadAccounts();
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      }
      return createdOrUpdated;
    } catch (err) {
      alert(err.message || 'Failed to save wallet');
      throw err;
    }
  };

  const handleArchiveWallet = async (id) => {
    if (!window.confirm('Are you sure you want to archive this wallet? Historical records will be preserved.')) return;
    try {
      await api.deleteWallet(id);
      await loadAccounts();
      if (currentMonth) {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      }
    } catch (err) {
      alert(err.message || 'Failed to archive wallet');
    }
  };

  // Transfer handlers
  const handleCreateTransfer = async (transferData) => {
    try {
      const created = await api.createTransfer({
        ...transferData,
        monthId: currentMonth._id
      });
      await loadAccounts();
      await loadMonthDetails(currentMonth.year, currentMonth.month);
      return created;
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteTransfer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transfer?')) return;
    try {
      await api.deleteTransfer(id);
      await loadAccounts();
      await loadMonthDetails(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to delete transfer');
    }
  };

  const handleOpenUnifiedEntry = (mode = 'log') => {
    if (isReviewMode) return;
    setEditingItem(null);
    setUnifiedEntryMode(mode);
    setUnifiedEntryOpen(true);
  };

  const handleEditItem = (item) => {
    if (isReviewMode) return;
    setEditingItem(item);
    const targetMode = resolveEntryModeFromItem(item);
    setUnifiedEntryMode(targetMode);
    setUnifiedEntryOpen(true);
  };

  const handleToggleAi = async (enabled) => {
    try {
      const updated = await api.updateSettings({ aiAssistantEnabled: enabled });
      setSettings(updated);
    } catch (err) {
      alert(err.message || 'Failed to toggle AI assistant');
    }
  };

  const handleSaveSalarySafeline = async ({ salaryBankAccountId, incomeAmount, salaryCreditedDate, isSalaryCredited, safetyFloor }) => {
    if (!currentMonth) return;
    try {
      const updates = {
        salaryBankAccountId,
        incomeAmount,
        salaryCreditedDate,
        incomeCreditDate: salaryCreditedDate,
        isSalaryCredited
      };
      if (safetyFloor !== undefined) {
        updates.safetyFloor = safetyFloor;
      }
      const updated = await api.updateMonth(currentMonth.year, currentMonth.month, updates);

      // Reload months to see if a cycle advancement provisioned a new period
      const list = await api.getMonths();
      setMonths(list || []);

      const targetMonth = updated.advancedMonth || (list && list.find((m) => !m.isClosed));
      if (targetMonth) {
        await loadMonthDetails(targetMonth.year, targetMonth.month);
      } else {
        await loadMonthDetails(currentMonth.year, currentMonth.month);
      }
      await loadAccounts();
    } catch (err) {
      alert(err.message || 'Failed to update salary details');
      throw err;
    }
  };


  const pendingSalaryTx = useMemo(() => {
    return transactions.find((t) => t.direction === 'income' && t.origin === 'salary' && t.status === 'planned');
  }, [transactions]);

  const handleConfirmSalary = async (tx) => {
    try {
      await handlePayTransaction(tx._id || tx.id, {
        amount: tx.amount,
        actualDate: new Date().toISOString().split('T')[0],
        destinationAccountId: tx.bankAccountId || tx.accountId
      });
    } catch (err) {
      console.error('Failed to confirm salary:', err);
    }
  };

  const hasAccounts = (bankAccounts && bankAccounts.length > 0) || (wallets && wallets.length > 0);
  const showOnboarding = user && accountsLoaded && !hasAccounts;

  const isInitialApiWaiting = user && (!accountsLoaded || (dataLoading && !currentMonth && months.length > 0));

  if (authLoading || isInitialApiWaiting) {
    return (
      <div className="app-splash-screen" role="status" aria-label="Loading application">
        <AnimatedLogo size={36} />
        <div className="app-splash-loader-bar">
          <div className="app-splash-loader-progress" />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          {authLoading ? 'Initializing Budget Planner' : 'Loading your financial plan...'}
        </span>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  if (showOnboarding) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main)' }}>
        <OnboardingModal
          currencySymbol={settings?.currencySymbol || '₹'}
          onCompleted={async () => {
            await loadAccounts();
            const updatedSettings = await api.getSettings();
            setSettings(updatedSettings);
            await loadMonths();
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {dataLoading && (
        <div className="top-activity-bar">
          <div className="top-activity-line" />
        </div>
      )}
      <Header
        user={user}
        months={months}
        currentMonth={currentMonth}
        simulation={activeSimulation}
        onSelectMonth={(y, m) => loadMonthDetails(y, m)}
        isReviewMode={isReviewMode}
        hasActivePlanningMonth={Boolean(activePlanningMonth)}
        onOpenRollover={() => setRolloverModalOpen(true)}
        nextMonthLabel={nextMonthLabel}
        onOpenSalarySafeline={() => setIsSalarySafelineOpen(true)}
        onDeleteMonth={handleDeleteMonth}
        onLogout={handleLogout}
        themeMode={themeMode}
        onCycleTheme={cycleTheme}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      <div className="app-container">
        {/* Continuous Tracking: Read-Only Period Review Banner */}
        {isReviewMode && (
          <div className="review-mode-banner">
            <div className="review-mode-banner-content">
              <span className="review-mode-icon">👁️</span>
              <div className="review-mode-text">
                <div className="review-mode-title">
                  Previewing {currentMonth ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][currentMonth.month - 1]} ${currentMonth.year}` : 'Archive'} (Historical Snapshot)
                </div>
                <div className="review-mode-subtext">
                  This historical period is completed and closed. Figures and account closing balances are strictly snapshotted.
                </div>
              </div>
            </div>
            {activePlanningMonth ? (
              <button
                type="button"
                className="review-mode-return-btn"
                data-testid="review-mode-return-btn"
                onClick={() => loadMonthDetails(activePlanningMonth.year, activePlanningMonth.month)}
              >
                Return to Current Month →
              </button>
            ) : (
              <button
                type="button"
                className="review-mode-start-next-btn"
                data-testid="banner-start-next-month-btn"
                onClick={() => setRolloverModalOpen(true)}
              >
                ⚡ Start {nextMonthLabel || 'Next Month'} →
              </button>
            )}
          </div>
        )}

        {pendingSalaryTx && (
          <div style={{
            margin: '12px 16px 0 16px',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05))',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>💰</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Salary Deposit Scheduled: {pendingSalaryTx.title} ({currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}{pendingSalaryTx.amount})
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Expected credit on {pendingSalaryTx.date}. Confirm deposit once received.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleConfirmSalary(pendingSalaryTx)}
                className="btn btn-primary"
                style={{ fontSize: '12px', padding: '6px 14px', background: '#10b981', borderColor: '#10b981' }}
              >
                Confirm Deposit
              </button>
            </div>
          </div>
        )}

      <main style={{ flex: 1 }}>
        <ErrorBoundary title="Screen rendering error">
          {activeTab === 'plan' && (
            <PlanScreen
              month={currentMonth}
              items={items}
              transactions={transactions}
              settings={settings}
              simulation={activeSimulation}
              accountSimulations={serverAccountSimulations}
              bankAccounts={bankAccounts}
              wallets={wallets}
              migrationEligible={migrationEligible}
              isReviewMode={isReviewMode}
              onOpenMigration={() => setMigrationModalOpen(true)}
              onOpenUnifiedEntry={handleOpenUnifiedEntry}
              onTogglePaid={handleTogglePaid}
              onOpenSalarySafeline={() => setIsSalarySafelineOpen(true)}
              onOpenReview={(accId) => {
                setReviewAccountId(accId || 'all');
                setReviewOpen(true);
              }}
              onPayTransaction={handlePayTransaction}
              onEditTransaction={handleEditItem}
            />
          )}

          {(activeTab === 'transactions' || activeTab === 'items') && (
            <TransactionsScreen
              transactions={transactions}
              currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
              bankAccounts={bankAccounts}
              wallets={wallets}
              isReviewMode={isReviewMode}
              onOpenUnifiedEntry={handleOpenUnifiedEntry}
              onEditTransaction={handleEditItem}
              onPayTransaction={handlePayTransaction}
              onCancelTransaction={handleCancelTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {activeTab === 'goals' && (
            <GoalsScreen
              month={currentMonth}
              goals={goals}
              items={items}
              transactions={transactions}
              simulation={activeSimulation}
              bankAccounts={bankAccounts}
              wallets={wallets}
              isReviewMode={isReviewMode}
              onCreateGoal={handleCreateGoal}
              onConvertGoalToItem={handleScheduleGoal}
              onScheduleGoal={handleScheduleGoal}
              onDeferGoal={handleDeferGoal}
              onReactivateGoal={handleReactivateGoal}
              onDeleteGoal={handleDeleteGoal}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsScreen
              bankAccounts={bankAccounts}
              wallets={wallets}
              transfers={transfers}
              simulation={activeSimulation}
              currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
              isReviewMode={isReviewMode}
              onSaveBankAccount={handleSaveBankAccount}
              onSaveWallet={handleSaveWallet}
              onArchiveBankAccount={handleArchiveBankAccount}
              onArchiveWallet={handleArchiveWallet}
              onCreateTransfer={handleCreateTransfer}
              onDeleteTransfer={handleDeleteTransfer}
              month={currentMonth}
              initialOpenBankModal={autoOpenAddBank}
              onResetBankModalTrigger={() => setAutoOpenAddBank(false)}
            />
          )}

          {activeTab === 'assistant' && (
            <AssistantScreen
              settings={settings}
              onToggleAi={handleToggleAi}
              simulation={activeSimulation}
              month={currentMonth}
              onSaveParsedItem={handleSaveItem}
              currencySymbol={currentMonth?.currencySymbol || '₹'}
            />
          )}
        </ErrorBoundary>
      </main>
      </div>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUnifiedEntry={handleOpenUnifiedEntry}
        isReviewMode={isReviewMode}
        hasActivePlanningMonth={Boolean(activePlanningMonth)}
        onOpenRollover={() => setRolloverModalOpen(true)}
        nextMonthLabel={nextMonthLabel}
      />

      {/* Unified Entry Modal: Single Component & Button for Logging & Planning */}
      <UnifiedEntryModal
        isOpen={unifiedEntryOpen}
        initialMode={unifiedEntryMode}
        initialItem={editingItem}
        plannedItems={items}
        bankAccounts={bankAccounts}
        wallets={wallets}
        currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
        month={currentMonth}
        simulation={activeSimulation}
        accountSimulations={serverAccountSimulations}
        onClose={() => {
          setUnifiedEntryOpen(false);
          setEditingItem(null);
        }}
        onLogTransaction={handleLogTransaction}
        onSaveItem={handleSaveItem}
        onCreateTransfer={handleCreateTransfer}
        onOpenAddBank={() => {
          setActiveTab('accounts');
          setAutoOpenAddBank(true);
        }}
      />

      {/* Month-End Review Modal */}
      <MonthEndReviewModal
        isOpen={reviewOpen}
        month={currentMonth}
        items={items}
        simulation={activeSimulation}
        currencySymbol={currentMonth?.currencySymbol || '₹'}
        accountId={reviewAccountId}
        onClose={() => setReviewOpen(false)}
      />

      {/* Salary & Safeline Linking Modal */}
      <SalarySafelineModal
        isOpen={isSalarySafelineOpen}
        onClose={() => setIsSalarySafelineOpen(false)}
        month={currentMonth}
        bankAccounts={bankAccounts}
        currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
        onSave={handleSaveSalarySafeline}
      />

      {/* Single Unified Migration Modal: Transfer Calculations */}
      <TransferCalculationsModal
        isOpen={migrationModalOpen}
        onClose={() => setMigrationModalOpen(false)}
        migrationStats={migrationStats}
        month={currentMonth}
        items={items}
        bankAccounts={bankAccounts}
        currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
        onMigrate={handleMigrated}
      />
      {/* Month Rollover & Cycle Advancement Modal */}
      <MonthRolloverModal
        isOpen={rolloverModalOpen}
        month={currentMonth}
        bankAccounts={bankAccounts}
        wallets={wallets}
        currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
        onClose={() => setRolloverModalOpen(false)}
        onConfirmRollover={handleRolloverSubmit}
      />
    </div>
  );
}
