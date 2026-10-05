import React, { useState, useEffect, useMemo } from 'react';
import { api } from './api.js';
import { simulate } from '@budget/engine';
import { Header } from './components/Header.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { PlanScreen } from './screens/PlanScreen.jsx';
import { ItemsScreen } from './screens/ItemsScreen.jsx';
import { GoalsScreen } from './screens/GoalsScreen.jsx';
import { AccountsScreen } from './screens/AccountsScreen.jsx';
import { AssistantScreen } from './screens/AssistantScreen.jsx';
import { UnifiedEntryModal } from './components/UnifiedEntryModal.jsx';
import { MonthEndReviewModal } from './components/MonthEndReviewModal.jsx';
import { CreateMonthModal, RolloverModal } from './components/MonthModals.jsx';
import { SalarySafelineModal } from './components/SalarySafelineModal.jsx';
import { TransferCalculationsModal } from './components/TransferCalculationsModal.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

import { AnimatedLogo } from './components/AnimatedLogo.jsx';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('budget_theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('budget_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

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
  const [transfers, setTransfers] = useState([]);
  const [activeTab, setActiveTab] = useState('plan');


  // Modals state
  const [unifiedEntryOpen, setUnifiedEntryOpen] = useState(false);
  const [unifiedEntryMode, setUnifiedEntryMode] = useState('log'); // 'log' | 'plan'
  const [editingItem, setEditingItem] = useState(null);
  const [autoOpenAddBank, setAutoOpenAddBank] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [createMonthOpen, setCreateMonthOpen] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [isSalarySafelineOpen, setIsSalarySafelineOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);

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
        let target = list[0];
        if (selectYear && selectMonth) {
          const match = list.find((m) => m.year === selectYear && m.month === selectMonth);
          if (match) target = match;
        }
        await loadMonthDetails(target.year, target.month);
      } else {
        setCurrentMonth(null);
        setItems([]);
        setTransactions([]);
        setGoals([]);
        setCreateMonthOpen(true);
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
      await loadGoals(year, monthNum);
    } catch (err) {
      console.error('Failed to load month details:', err);
    } finally {
      setDataLoading(false);
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
      loadMonths();
      checkMigrationEligibility();
    }
  }, [user]);

  // Pure in-browser simulation calculation with accounts, transfers, and actual transactions
  const activeSimulation = useMemo(() => {
    if (!currentMonth) return null;

    const now = new Date();
    const currentYearMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const viewingYearMonth = Number(currentMonth.year) * 12 + Number(currentMonth.month);

    let currentDay = null;
    if (viewingYearMonth === currentYearMonth) {
      currentDay = now.getDate();
    } else if (viewingYearMonth < currentYearMonth) {
      currentDay = null; // Past month: completed, show ending balance
    } else {
      currentDay = 0; // Future month: show opening balance
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
      items,
      { year: currentMonth.year, month: currentMonth.month },
      transactions,
      goals,
      transfers,
      [
        ...bankAccounts.map((b) => ({ ...b, type: 'bank' })),
        ...wallets.map((w) => ({ ...w, type: 'wallet' }))
      ]
    );
  }, [currentMonth, items, transactions, goals, transfers, bankAccounts, wallets]);

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
    setGoals([]);
    setTransfers([]);
    setMigrationEligible(false);
    setMigrationStats(null);
    setMigrationModalOpen(false);
    sessionStorage.removeItem('budget_migration_dismissed');
  };


  // Transaction entry actions
  const handleLogTransaction = async (txData) => {
    try {
      const created = await api.createTransaction(currentMonth.year, currentMonth.month, txData);
      setTransactions((prev) => [...prev, created]);
      setUnifiedEntryOpen(false);
      loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to log transaction');
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t._id !== id));
      loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to delete transaction');
    }
  };

  // Item actions
  const handleSaveItem = async (itemData) => {
    try {
      if (editingItem) {
        const updated = await api.updateItem(editingItem._id, itemData);
        setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
        setTransactions((prev) =>
          prev.map((t) =>
            String(t.plannedItemId) === String(updated._id)
              ? {
                  ...t,
                  accountType: updated.accountType,
                  bankAccountId: updated.bankAccountId,
                  walletId: updated.walletId
                }
              : t
          )
        );
      } else {
        const created = await api.createItem(currentMonth.year, currentMonth.month, itemData);
        setItems((prev) => [...prev, created]);
      }
      setUnifiedEntryOpen(false);
      setEditingItem(null);
      loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to save item');
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('Delete this item from the month?')) return;
    try {
      await api.deleteItem(id);
      setItems((prev) => prev.filter((i) => i._id !== id));
      loadGoals(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to delete item');
    }
  };

  const handleTogglePaid = async (id, isPaid) => {
    try {
      const updated = await api.updateItem(id, { isPaid });
      setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    } catch (err) {
      alert(err.message || 'Failed to update payment status');
    }
  };

  // Month actions
  const handleCreateMonth = async (monthData) => {
    try {
      let salaryBankId = monthData.salaryBankAccountId;
      let accountOpenings = monthData.accountOpeningBalances;

      if (monthData.newBankAccount) {
        const createdBank = await api.createBankAccount(monthData.newBankAccount);
        const bankId = createdBank._id || createdBank.id;
        salaryBankId = bankId;
        accountOpenings = [
          {
            accountType: 'bank',
            bankAccountId: bankId,
            openingBalance: monthData.newBankAccount.openingBalance || 0
          }
        ];
        await loadAccounts();
      }

      const payload = {
        ...monthData,
        salaryBankAccountId: salaryBankId,
        accountOpeningBalances: accountOpenings
      };
      delete payload.newBankAccount;

      const created = await api.createMonth(payload);
      setCreateMonthOpen(false);
      await loadAccounts();
      await loadMonths(created.year, created.month);
    } catch (err) {
      alert(err.message || 'Failed to create month');
    }
  };

  const handleRollover = async (carryBalance) => {
    try {
      const res = await api.rolloverMonth(currentMonth.year, currentMonth.month, carryBalance);
      setRolloverOpen(false);
      await loadMonths(res.month.year, res.month.month);
    } catch (err) {
      alert(err.message || 'Failed to perform month rollover');
    }
  };

  const handleSaveMonthSettings = async (updates) => {
    try {
      const res = await api.updateMonth(currentMonth.year, currentMonth.month, updates);
      setCurrentMonth(res.month);
      loadGoals(res.month.year, res.month.month);
      if (updates.salaryBankAccountId !== undefined) {
        api.updateSettings({ defaultSalaryBankAccountId: updates.salaryBankAccountId }).catch(() => {});
      }
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

  const handleConvertGoalToItem = async (goalId) => {
    try {
      await api.convertGoalToItem(goalId);
      await loadMonthDetails(currentMonth.year, currentMonth.month);
    } catch (err) {
      alert(err.message || 'Failed to schedule goal purchase');
    }
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
        setBankAccounts((prev) =>
          prev.map((b) => ((b._id || b.id) === data.id ? createdOrUpdated : (data.isPrimary ? { ...b, isPrimary: false } : b)))
        );
      } else {
        createdOrUpdated = await api.createBankAccount(data);
        setBankAccounts((prev) => [
          ...prev.map((b) => (data.isPrimary ? { ...b, isPrimary: false } : b)),
          createdOrUpdated
        ]);
      }
      return createdOrUpdated;
    } catch (err) {
      alert(err.message || 'Failed to save bank account');
    }
  };

  const handleArchiveBankAccount = async (id) => {
    if (!window.confirm('Are you sure you want to archive this bank account? Historical records will be preserved.')) return;
    try {
      await api.deleteBankAccount(id);
      setBankAccounts((prev) => prev.filter((b) => (b._id || b.id) !== id));
    } catch (err) {
      alert(err.message || 'Failed to archive bank account');
    }
  };

  // Wallet handlers
  const handleSaveWallet = async (data) => {
    try {
      if (data.id) {
        const updated = await api.updateWallet(data.id, data);
        setWallets((prev) =>
          prev.map((w) => ((w._id || w.id) === data.id ? updated : (data.isPrimary ? { ...w, isPrimary: false } : w)))
        );
      } else {
        const created = await api.createWallet(data);
        setWallets((prev) => [
          ...prev.map((w) => (data.isPrimary ? { ...w, isPrimary: false } : w)),
          created
        ]);
      }
    } catch (err) {
      alert(err.message || 'Failed to save wallet');
    }
  };

  const handleArchiveWallet = async (id) => {
    if (!window.confirm('Are you sure you want to archive this wallet? Historical records will be preserved.')) return;
    try {
      await api.deleteWallet(id);
      setWallets((prev) => prev.filter((w) => (w._id || w.id) !== id));
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
      setTransfers((prev) => [...prev, created]);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteTransfer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transfer?')) return;
    try {
      await api.deleteTransfer(id);
      setTransfers((prev) => prev.filter((t) => (t._id || t.id) !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete transfer');
    }
  };

  const handleOpenUnifiedEntry = (mode = 'log') => {
    setEditingItem(null);
    setUnifiedEntryMode(mode);
    setUnifiedEntryOpen(true);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setUnifiedEntryMode('plan');
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

  const handleSaveSalarySafeline = async ({ salaryBankAccountId, incomeAmount, salaryCreditedDate, isSalaryCredited }) => {
    if (!currentMonth) return;
    try {
      const updated = await api.updateMonth(currentMonth.year, currentMonth.month, {
        salaryBankAccountId,
        incomeAmount,
        salaryCreditedDate,
        incomeCreditDate: salaryCreditedDate,
        isSalaryCredited
      });
      setCurrentMonth(updated.month);
      setItems(updated.items || []);
      setTransactions(updated.transactions || []);
      setTransfers(updated.transfers || []);
      if (updated.bankAccounts) setBankAccounts(updated.bankAccounts);
      if (updated.wallets) setWallets(updated.wallets);
      await loadAccounts();
    } catch (err) {
      alert(err.message || 'Failed to update salary details');
      throw err;
    }
  };


  if (authLoading) {
    return (
      <div className="app-splash-screen">
        <AnimatedLogo size={36} />
        <div className="app-splash-loader-bar">
          <div className="app-splash-loader-progress" />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          Initializing Budget Planner
        </span>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
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
        onOpenCreateMonth={() => setCreateMonthOpen(true)}
        onOpenRollover={() => setRolloverOpen(true)}
        onOpenSalarySafeline={() => setIsSalarySafelineOpen(true)}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      <div className="app-container">

      <main style={{ flex: 1 }}>
        <ErrorBoundary title="Screen rendering error">
          {activeTab === 'plan' && (
            <PlanScreen
              month={currentMonth}
              items={items}
              simulation={activeSimulation}
              bankAccounts={bankAccounts}
              wallets={wallets}
              migrationEligible={migrationEligible}
              onOpenMigration={() => setMigrationModalOpen(true)}
              onOpenUnifiedEntry={handleOpenUnifiedEntry}
              onOpenReview={() => setReviewOpen(true)}
            />
          )}

          {activeTab === 'items' && (
            <ItemsScreen
              items={items}
              transactions={transactions}
              simulation={activeSimulation}
              currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
              bankAccounts={bankAccounts}
              wallets={wallets}
              onOpenUnifiedEntry={handleOpenUnifiedEntry}
              onEditItem={handleEditItem}
              onTogglePaid={handleTogglePaid}
              onDeleteItem={handleDeleteItem}
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
              onCreateGoal={handleCreateGoal}
              onConvertGoalToItem={handleConvertGoalToItem}
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

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

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
        onClose={() => setReviewOpen(false)}
      />

      {/* Create Month Modal */}
      <CreateMonthModal
        isOpen={createMonthOpen}
        settings={settings}
        bankAccounts={bankAccounts}
        wallets={wallets}
        onClose={() => setCreateMonthOpen(false)}
        onCreate={handleCreateMonth}
      />

      {/* Rollover Modal */}
      <RolloverModal
        isOpen={rolloverOpen}
        currentMonth={currentMonth}
        endingBalance={activeSimulation?.endingBalance || 0}
        currencySymbol={currentMonth?.currencySymbol || '₹'}
        bankAccounts={bankAccounts}
        wallets={wallets}
        simulation={activeSimulation}
        onClose={() => setRolloverOpen(false)}
        onConfirm={handleRollover}
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
    </div>
  );
}
