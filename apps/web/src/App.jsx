import React, { useState, useEffect, useMemo } from 'react';
import { api } from './api.js';
import { simulate } from '@budget/engine';
import { Header } from './components/Header.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { PlanScreen } from './screens/PlanScreen.jsx';
import { ItemsScreen } from './screens/ItemsScreen.jsx';
import { GoalsScreen } from './screens/GoalsScreen.jsx';
import { AssistantScreen } from './screens/AssistantScreen.jsx';
import { UnifiedEntryModal } from './components/UnifiedEntryModal.jsx';
import { MonthEndReviewModal } from './components/MonthEndReviewModal.jsx';
import { CreateMonthModal, RolloverModal } from './components/MonthModals.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';

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

  // Month & Items state
  const [months, setMonths] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(null);
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [activeTab, setActiveTab] = useState('plan');


  // Modals state
  const [unifiedEntryOpen, setUnifiedEntryOpen] = useState(false);
  const [unifiedEntryMode, setUnifiedEntryMode] = useState('log'); // 'log' | 'plan'
  const [editingItem, setEditingItem] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [createMonthOpen, setCreateMonthOpen] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);

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
    try {
      const list = await api.getMonths();
      setMonths(list);
      if (list.length > 0) {
        let target = list[0];
        if (selectYear && selectMonth) {
          const match = list.find((m) => m.year === selectYear && m.month === selectMonth);
          if (match) target = match;
        }
        loadMonthDetails(target.year, target.month);
      } else {
        setCurrentMonth(null);
        setItems([]);
        setTransactions([]);
        setGoals([]);
        setCreateMonthOpen(true);
      }
    } catch (err) {
      console.error('Failed to load months:', err);
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
    try {
      const res = await api.getMonthDetail(year, monthNum);
      setCurrentMonth(res.month);
      setItems(res.items);
      setTransactions(res.transactions || []);
      loadGoals(year, monthNum);
    } catch (err) {
      console.error('Failed to load month details:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadMonths();
    }
  }, [user]);

  // Pure in-browser simulation calculation with actual transactions support
  const activeSimulation = useMemo(() => {
    if (!currentMonth) return null;

    const currentDay = new Date().getDate();

    return simulate(
      {
        openingBalance: currentMonth.openingBalance,
        incomeAmount: currentMonth.incomeAmount,
        incomeCreditDay: currentMonth.incomeCreditDay,
        incomeCreditDate: currentMonth.incomeCreditDate,
        safetyFloor: currentMonth.safetyFloor,
        unplannedAllowance: currentMonth.unplannedAllowance || 0,
        currentDay,
        scale: 100
      },
      items,
      { year: currentMonth.year, month: currentMonth.month },
      transactions,
      goals
    );
  }, [currentMonth, items, transactions, goals]);

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
      const created = await api.createMonth(monthData);
      setCreateMonthOpen(false);
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

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        Loading budget planner...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <div className="app-shell">
      <Header
        user={user}
        months={months}
        currentMonth={currentMonth}
        simulation={activeSimulation}
        onSelectMonth={(y, m) => loadMonthDetails(y, m)}
        onOpenCreateMonth={() => setCreateMonthOpen(true)}
        onOpenRollover={() => setRolloverOpen(true)}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="app-container">

      <main style={{ flex: 1 }}>
        {activeTab === 'plan' && (
          <PlanScreen
            month={currentMonth}
            items={items}
            simulation={activeSimulation}
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
            onCreateGoal={handleCreateGoal}
            onConvertGoalToItem={handleConvertGoalToItem}
            onDeferGoal={handleDeferGoal}
            onReactivateGoal={handleReactivateGoal}
            onDeleteGoal={handleDeleteGoal}
            onSaveMonthSettings={handleSaveMonthSettings}
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
      </main>
      </div>

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Unified Entry Modal: Single Component & Button for Logging & Planning */}
      <UnifiedEntryModal
        isOpen={unifiedEntryOpen}
        initialMode={unifiedEntryMode}
        initialItem={editingItem}
        plannedItems={items}
        currencySymbol={currentMonth?.currencySymbol || settings?.currencySymbol || '₹'}
        month={currentMonth}
        onClose={() => {
          setUnifiedEntryOpen(false);
          setEditingItem(null);
        }}
        onLogTransaction={handleLogTransaction}
        onSaveItem={handleSaveItem}
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
        onClose={() => setCreateMonthOpen(false)}
        onCreate={handleCreateMonth}
      />

      {/* Rollover Modal */}
      <RolloverModal
        isOpen={rolloverOpen}
        currentMonth={currentMonth}
        endingBalance={activeSimulation?.endingBalance || 0}
        currencySymbol={currentMonth?.currencySymbol || '₹'}
        onClose={() => setRolloverOpen(false)}
        onConfirm={handleRollover}
      />
    </div>
  );
}
