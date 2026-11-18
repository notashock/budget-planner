import {
  getDaysInMonth,
  clampDayToMonth,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
} from './calendar.js';
import { getGoalMonthlyReserve } from './planInsights.js';
import {
  deriveTransactionState,
  isDiscretionarySpend,
  summarizeLowPoints,
  isSameTransaction,
  dailyLimit,
  classifyPace,
  buildDayRows,
  indexAccountSummaries,
  isPassThrough,
  passThroughCashSign,
  passThroughDeltas
} from './simulatorParts.js';
import { projectCycleSpend, scoreCardPayability, daysBetween } from './cardPayability.js';

// Re-exported so existing imports from './simulator.js' keep working
export { deriveTransactionState, isDiscretionarySpend, summarizeLowPoints };

/**
 * Pure simulation engine.
 * Computes deterministic running balance timeline, safety floor breaches,
 * real-world transactions, today's balance, net transaction refunds,
 * per-account balance trajectories, and Paired Account Transfers.
 * 
 * @param {object} settings
 * @param {number} [settings.openingBalance=0] - Starting balance in minor units
 * @param {number} [settings.incomeAmount=0] - Monthly income in minor units
 * @param {string} [settings.incomeCreditDate] - Specific date salary is credited (YYYY-MM-DD)
 * @param {number} [settings.incomeCreditDay=1] - Day of month income is credited (1 - 31)
 * @param {string} [settings.salaryBankAccountId] - Designated Bank Account ID for salary deposit
 * @param {number} [settings.safetyFloor=0] - Safety floor threshold in minor units
 * @param {number} [settings.unplannedAllowance=0] - Monthly unplanned allowance in minor units
 * @param {number} [settings.currentDay] - Current day of month for today's balance (1 - 31)
 * @param {number} [settings.scale=100] - Scale factor (100 for cents, 1 for whole units)
 * @param {Array<object>} [settings.accountOpeningBalances=[]] - Per-account opening balances breakdown
 * @param {Array<object>} [settings.accounts=[]] - List of bank accounts and wallets
 * @param {Array<object>} [settings.transfers=[]] - Logged Paired Account Transfers
 * 
 * @param {Array<object>} items - List of transactions or planned records for the month
 * @param {object} month - { year, month } (month 1 - 12)
 * @param {Array<object>} [transactions=[]] - Logged transactions
 * @param {Array<object>} [goals=[]] - Active purchase goals
 * @param {Array<object>} [transfers=[]] - Optional direct transfers parameter
 * @param {Array<object>|object} [accounts=[]] - Optional direct accounts parameter
 * 
 * @returns {object} SimulationResult
 */
export function simulate(
  settings = {},
  items = [],
  month = { year: 2026, month: 1 },
  transactions = [],
  goals = [],
  transfers = [],
  accounts = []
) {
  const { year, month: monthNum } = month;
  const daysInMonth = getDaysInMonth(year, monthNum);
  const normalizeId = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val.trim();
    if (val._id) return String(val._id).trim();
    if (val.id) return String(val.id).trim();
    if (val.accountId) return String(val.accountId).trim();
    if (typeof val.toString === 'function') {
      const s = val.toString();
      if (s && s !== '[object Object]') return s.trim();
    }
    return null;
  };

  const scale = settings.scale ?? 100;
  const openingBalance = Math.round(settings.openingBalance ?? 0);
  const rawIncomeAmount = Math.round(settings.incomeAmount ?? 0);
  const defaultIncomeAmount = Math.round(settings.defaultIncomeAmount ?? 0);
  const incomeAmount = rawIncomeAmount > 0 ? rawIncomeAmount : defaultIncomeAmount;
  const incomeCreditDay = settings.incomeCreditDay ?? 1;
  const salaryBankAccountId = normalizeId(settings.salaryBankAccountId);
  const rawSafetyFloor = Math.round(settings.safetyFloor ?? 0);
  const unplannedAllowance = Math.round(settings.unplannedAllowance ?? 0);

  // Held & Lent money carried in from before this month (server-derived, minor units)
  const heldOpeningBalance = Math.max(0, Math.round(Number(settings.heldOpeningBalance) || 0));
  const lentOpeningBalance = Math.max(0, Math.round(Number(settings.lentOpeningBalance) || 0));
  const heldOpeningByAccountInput = settings.heldOpeningByAccount && typeof settings.heldOpeningByAccount === 'object'
    ? settings.heldOpeningByAccount
    : {};

  // Credit cards (ADR 0070): never liquid cash. A swipe is spending on the swipe
  // day but moves no cash; paying the bill moves cash from a bank to the card.
  const creditCards = (Array.isArray(settings.creditCards) ? settings.creditCards : [])
    .map((c) => ({ ...c, id: normalizeId(c.id || c._id) }))
    .filter((c) => c.id);
  const cardIdSet = new Set(creditCards.map((c) => c.id));
  const isCardId = (id) => Boolean(id) && cardIdSet.has(String(id));
  const nextIncome = settings.nextIncome && Number(settings.nextIncome.amount) > 0 ? settings.nextIncome : null;

  // Transfers normalization
  const transfersInput = Array.isArray(transfers) && transfers.length > 0
    ? transfers
    : (Array.isArray(settings.transfers) ? settings.transfers : []);

  const toPlainObj = (x) => {
    if (!x) return x;
    if (typeof x.toObject === 'function') return x.toObject();
    if (x._doc) return { ...x._doc };
    return x;
  };

  // Accounts normalization
  let rawAccounts = [];
  if (Array.isArray(accounts) && accounts.length > 0) {
    rawAccounts = accounts.map(toPlainObj);
  } else if (Array.isArray(settings.accounts)) {
    rawAccounts = settings.accounts.map(toPlainObj);
  } else if (settings.accounts && (Array.isArray(settings.accounts.bankAccounts) || Array.isArray(settings.accounts.wallets))) {
    const rawBanks = (settings.accounts.bankAccounts || []).map(toPlainObj);
    const rawWallets = (settings.accounts.wallets || []).map(toPlainObj);
    rawAccounts = [
      ...rawBanks.map((b) => ({ ...b, type: 'bank' })),
      ...rawWallets.map((w) => ({ ...w, type: 'wallet' }))
    ];
  }

  // Cards are tracked separately, never as cash accounts
  rawAccounts = rawAccounts.filter((a) => a && a.type !== 'credit_card' && !isCardId(normalizeId(a._id) || normalizeId(a.id)));

  const accountOpeningMap = {};
  const acctOpenings = Array.isArray(settings.accountOpeningBalances)
    ? settings.accountOpeningBalances
    : [];
  acctOpenings.forEach((entry) => {
    const aId = normalizeId(entry?.accountId);
    if (aId) {
      accountOpeningMap[aId] = Math.round(Number(entry.amount) || 0);
    }
  });

  let sumAccountsOpening = 0;
  const normalizedAccounts = rawAccounts.map((acc) => {
    const canonicalId = normalizeId(acc._id) || normalizeId(acc.id) || '';
    const altId = normalizeId(acc.id) || normalizeId(acc._id) || '';
    const mappedOpening = accountOpeningMap[canonicalId] !== undefined
      ? accountOpeningMap[canonicalId]
      : (altId && accountOpeningMap[altId] !== undefined
          ? accountOpeningMap[altId]
          : Math.round(Number(acc.openingBalance) || 0));
    sumAccountsOpening += mappedOpening;

    return {
      id: canonicalId,
      altId: altId !== canonicalId ? altId : null,
      type: acc.type || (acc.walletType ? 'wallet' : 'bank'),
      name: acc.name || 'Account',
      institution: acc.institution || '',
      accountType: acc.accountType || '',
      accountNumberMasked: acc.accountNumberMasked || '',
      openingBalance: mappedOpening,
      minimumBalance: Math.round(Number(acc.minimumBalance) || 0),
      isPrimary: Boolean(acc.isPrimary),
      isArchived: Boolean(acc.isArchived)
    };
  });

  const sumAccountsMinimumBalance = normalizedAccounts.reduce(
    (sum, a) => sum + (Math.round(Number(a.minimumBalance)) || 0),
    0
  );
  const safetyFloor = Math.max(rawSafetyFloor || 0, sumAccountsMinimumBalance || 0);

  const primaryBank = normalizedAccounts.find((a) => a.type === 'bank' && a.isPrimary) ||
                      normalizedAccounts.find((a) => a.type === 'bank') ||
                      normalizedAccounts[0] || null;
  const primaryBankId = primaryBank ? primaryBank.id : null;
  const designatedSalaryBankId = salaryBankAccountId || primaryBankId;

  const effectiveOpeningBalance = normalizedAccounts.length > 0
    ? (sumAccountsOpening + Math.max(0, openingBalance - sumAccountsOpening))
    : openingBalance;

  const unassignedOpening = normalizedAccounts.length > 0
    ? Math.max(0, openingBalance - sumAccountsOpening)
    : openingBalance;

  // Determine current day for today's balance calculation (0 = future month opening, null = past month ending, 1-31 = today)
  const currentDay = typeof settings.currentDay === 'number'
    ? (settings.currentDay === 0 ? 0 : Math.max(1, Math.min(daysInMonth, Math.floor(settings.currentDay))))
    : null;

  /** @type {Array<object>} */
  const rawEvents = [];

  // Check if an actual salary transaction exists or if salary is explicitly marked credited
  const isSalaryMarkedCredited = Boolean(settings.isSalaryCredited || month.isSalaryCredited);
  const salaryTx = (transactions || []).find((tx) => {
    if (tx.isSalary) return true;
    if (settings.salaryTransactionId && String(tx._id || tx.id) === String(settings.salaryTransactionId)) return true;
    if (month?.salaryTransactionId && String(tx._id || tx.id) === String(month.salaryTransactionId)) return true;
    if (tx.isIncome && String(tx.note || '').toLowerCase() === 'monthly salary') return true;
    if (tx.isIncome && String(tx.tag || '').toLowerCase() === 'salary' && incomeAmount > 0 && Math.round(Number(tx.amount)) === incomeAmount) return true;
    return false;
  });

  const effectiveSalaryAmount = salaryTx && Number(salaryTx.amount) > 0
    ? Math.round(Number(salaryTx.amount))
    : incomeAmount;

  // 1. Generate Income Event
  if (effectiveSalaryAmount > 0) {
    let incomeDay = 1;
    let incomeDate = formatDate(year, monthNum, 1);
    const hasSalaryContext = Boolean(salaryBankAccountId || settings.salaryCreditedDate || settings.incomeCreditDate || isSalaryMarkedCredited || salaryTx);
    const defaultSalaryLabel = hasSalaryContext ? 'Salary' : 'Income';
    let incomeLabel = isSalaryMarkedCredited ? 'Salary (Credited)' : defaultSalaryLabel;
    const isActualSalary = Boolean(salaryTx || isSalaryMarkedCredited);

    if (salaryTx) {
      incomeDate = salaryTx.date || formatDate(year, monthNum, 1);
      incomeDay = getRelativeDay(incomeDate, year, monthNum);
      if (incomeDay > 0) incomeDay = clampDayToMonth(incomeDay, daysInMonth);
      incomeLabel = salaryTx.note ? `Salary: ${salaryTx.note}` : (incomeDay <= 0 ? `Salary (credited ${incomeDate})` : 'Salary (Credited)');
    } else if (settings.salaryCreditedDate && typeof settings.salaryCreditedDate === 'string' && settings.salaryCreditedDate.trim()) {
      incomeDate = settings.salaryCreditedDate.trim();
      const relDay = getRelativeDay(incomeDate, year, monthNum);
      incomeDay = relDay > 0 ? clampDayToMonth(relDay, daysInMonth) : relDay;
      incomeLabel = relDay <= 0 ? `Salary (credited ${incomeDate})` : (isSalaryMarkedCredited ? 'Salary (Credited)' : defaultSalaryLabel);
    } else if (settings.incomeCreditDate && typeof settings.incomeCreditDate === 'string' && settings.incomeCreditDate.trim()) {
      const parsedDate = settings.incomeCreditDate.trim();
      const firstOfMonth = formatDate(year, monthNum, 1);
      if (parsedDate < firstOfMonth) {
        incomeDay = getRelativeDay(parsedDate, year, monthNum);
        incomeDate = parsedDate;
        incomeLabel = `Salary (credited ${parsedDate})`;
      } else if (parsedDate === firstOfMonth) {
        incomeDay = 1;
        incomeDate = firstOfMonth;
        incomeLabel = isSalaryMarkedCredited ? 'Salary (Credited)' : defaultSalaryLabel;
      } else {
        const parts = parsedDate.split('-');
        const parsedD = parseInt(parts[2], 10);
        incomeDay = clampDayToMonth(isNaN(parsedD) ? 1 : parsedD, daysInMonth);
        incomeDate = formatDate(year, monthNum, incomeDay);
        incomeLabel = isSalaryMarkedCredited ? 'Salary (Credited)' : defaultSalaryLabel;
      }
    } else {
      incomeDay = clampDayToMonth(incomeCreditDay, daysInMonth);
      incomeDate = formatDate(year, monthNum, incomeDay);
      incomeLabel = isSalaryMarkedCredited ? 'Salary (Credited)' : defaultSalaryLabel;
    }

    const salaryBankTarget = salaryTx?.bankAccountId
      ? normalizeId(salaryTx.bankAccountId)
      : (salaryBankAccountId || designatedSalaryBankId || null);

    rawEvents.push({
      day: incomeDay,
      date: incomeDate,
      label: incomeLabel,
      amount: effectiveSalaryAmount,
      priority: -Infinity,
      sourceIndex: -1,
      itemType: 'salary',
      isActual: isActualSalary,
      isSalary: true,
      transactionId: salaryTx ? (salaryTx.id || salaryTx._id || null) : null,
      itemId: null,
      accountType: salaryBankTarget ? 'bank' : null,
      bankAccountId: salaryBankTarget,
      walletId: salaryTx?.walletId ? normalizeId(salaryTx.walletId) : null
    });
  }

  // 2. Identify planned items fulfilled by logged transactions
  const fulfilledItemIds = new Set();
  const itemRefundMap = {};

  (transactions || []).forEach((tx) => {
    // Only successful transactions fulfill planned items; planned transactions are unfulfilled commitments
    if (tx.status === 'planned') return;

    if (tx.plannedItemId) {
      const pIdStr = String(tx.plannedItemId);
      const txAmount = Math.round(Number(tx.amount) || 0);

      if (txAmount > 0) {
        fulfilledItemIds.add(pIdStr);
      } else if (txAmount < 0) {
        const refundAmt = Math.abs(txAmount);
        itemRefundMap[pIdStr] = (itemRefundMap[pIdStr] || 0) + refundAmt;
      }
    }
  });

  // Combine items and planned transactions (excluding cancelled and strictly deduplicating against transactions)
  const plannedRecords = [
    ...(transactions || []).filter((tx) => tx.status === 'planned'),
    ...(items || []).filter((it) => {
      if (it.status === 'cancelled') return false;
      const itId = it.id ? String(it.id) : (it._id ? String(it._id) : null);
      // Skip if this item is already represented as a planned or successful transaction
      if (itId && (transactions || []).some((tx) => {
        const txId = tx.id ? String(tx.id) : (tx._id ? String(tx._id) : null);
        const legId = tx.legacyItemId ? String(tx.legacyItemId) : null;
        const planId = tx.plannedItemId ? String(tx.plannedItemId) : null;
        return txId === itId || legId === itId || planId === itId;
      })) {
        return false;
      }
      // If it is marked paid and already has a matching transaction by name/amount, skip
      if (it.isPaid && (transactions || []).some((tx) => tx.name === it.name && Math.abs(Number(tx.amount)) === Math.abs(Number(it.amount)))) {
        return false;
      }
      return true;
    })
  ];

  // 3. Generate Expense Events from Unfulfilled Planned Records
  // Pre-calculate future scheduled load per day for forward-rolling overdue pending items
  const forwardRollDayMap = {};
  const rollStartDay = typeof currentDay === 'number' && currentDay >= 1 ? Math.min(daysInMonth, currentDay + 1) : 1;
  for (let d = rollStartDay; d <= daysInMonth; d++) {
    forwardRollDayMap[d] = 0;
  }
  plannedRecords.forEach((it) => {
    let td = 1;
    if (it.date || it.plannedDate) {
      const parts = (it.plannedDate || it.date).split('-');
      if (parts.length === 3) td = clampDayToMonth(parseInt(parts[2], 10), daysInMonth);
    } else if (it.type === 'recurring' || it.dayOfMonth) td = clampDayToMonth(it.dayOfMonth ?? 1, daysInMonth);
    else if (it.type === 'one-time' || it.day) td = clampDayToMonth(it.day ?? 1, daysInMonth);
    if (td >= rollStartDay) {
      if (!it.isIncome && it.origin !== 'salary' && passThroughCashSign(it.origin) <= 0) {
        forwardRollDayMap[td] = (forwardRollDayMap[td] || 0) + Math.abs(Math.round(it.plannedAmount ?? it.amount ?? 0));
      }
    }
  });

  const getNextRecommendedDayForPending = (itemAmt) => {
    let chosenDay = rollStartDay;
    let minLoad = Infinity;
    for (let d = rollStartDay; d <= daysInMonth; d++) {
      const load = forwardRollDayMap[d] ?? 0;
      if (load < minLoad) {
        minLoad = load;
        chosenDay = d;
      }
    }
    forwardRollDayMap[chosenDay] = (forwardRollDayMap[chosenDay] || 0) + itemAmt;
    return chosenDay;
  };

  plannedRecords.forEach((item, index) => {
    const itemIdStr = String(item.id || item._id || '');
    if (fulfilledItemIds.has(itemIdStr)) {
      return;
    }

    const priority = typeof item.priority === 'number' ? item.priority : 0;
    const rawBankId = normalizeId(item.bankAccountId || item.accountId);
    const rawWallId = normalizeId(item.walletId);
    const plannedCardId = isCardId(rawBankId) ? rawBankId : null;
    const isKnownBank = rawBankId && normalizedAccounts.some((a) => a.id === rawBankId || a.altId === rawBankId);
    const isKnownWall = rawWallId && normalizedAccounts.some((a) => a.id === rawWallId || a.altId === rawWallId);
    const bankId = plannedCardId ? null : (isKnownBank ? rawBankId : (!isKnownWall ? (primaryBankId || designatedSalaryBankId) : null));
    const wallId = plannedCardId ? null : (isKnownWall ? rawWallId : null);
    const acctType = item.accountType || (bankId ? 'bank' : (wallId ? 'wallet' : null));

    if (item.type === 'one-time' || item.status === 'planned') {
      const isPlannedTx = item.status === 'planned';
      const dateVal = isPlannedTx ? (item.plannedDate || item.date) : item.date;
      let targetDay = 1;
      let targetDate = '';
      if (typeof item.day === 'number') {
        if (item.day < 0) {
          targetDay = item.day;
          targetDate = dateVal || getDateFromRelativeDay(item.day, year, monthNum);
        } else {
          targetDay = clampDayToMonth(item.day, daysInMonth);
          targetDate = dateVal || formatDate(year, monthNum, targetDay);
        }
      } else if (dateVal) {
        targetDay = getRelativeDay(dateVal, year, monthNum);
        if (targetDay > 0) targetDay = clampDayToMonth(targetDay, daysInMonth);
        targetDate = dateVal;
      } else {
        targetDay = 1;
        targetDate = formatDate(year, monthNum, 1);
      }

      const passThroughKind = isPassThrough(item) ? item.origin : null;
      const isIncomePlanned = Boolean(item.isIncome || item.origin === 'salary' || passThroughCashSign(item.origin) > 0);
      const rawAmount = isPlannedTx && item.plannedAmount !== undefined && item.plannedAmount !== null
        ? item.plannedAmount
        : (item.amount ?? 0);
      const amount = isIncomePlanned ? Math.max(0, Math.round(rawAmount)) : Math.round(rawAmount);

      let effectiveDay = targetDay;
      if (item.isPaid === true) {
        if (currentDay !== null && currentDay !== undefined && currentDay >= 1) {
          effectiveDay = Math.min(targetDay, currentDay);
        }
      } else if (item.isPaid === false || isPlannedTx) {
        if (currentDay !== null && currentDay !== undefined && targetDay < currentDay) {
          effectiveDay = getNextRecommendedDayForPending(Math.abs(amount));
        }
      }
      const isPastDueUnpaid = (item.isPaid === false || isPlannedTx) && currentDay !== null && currentDay !== undefined && targetDay < currentDay;
      const effectiveDate = effectiveDay < 0
        ? (dateVal || getDateFromRelativeDay(effectiveDay, year, monthNum))
        : formatDate(year, monthNum, effectiveDay);

      rawEvents.push({
        day: effectiveDay,
        date: effectiveDate,
        originalDay: (typeof item.originalDay === 'number') ? item.originalDay : targetDay,
        originalDate: item.originalDate || targetDate,
        label: item.name,
        name: item.name,
        category: item.category || item.tag || 'General',
        description: item.name,
        amount: isIncomePlanned ? amount : -Math.abs(amount),
        priority,
        sourceIndex: index,
        itemType: passThroughKind ? 'pass-through' : (isPlannedTx ? 'planned-transaction' : 'one-time'),
        isPlannedTransaction: isPlannedTx,
        isCardSpend: Boolean(plannedCardId),
        cardAccountId: plannedCardId,
        passThroughKind,
        personFundId: item.personFundId || null,
        origin: item.origin || null,
        heldDelta: passThroughKind ? passThroughDeltas(passThroughKind, amount).held : 0,
        lentDelta: passThroughKind ? passThroughDeltas(passThroughKind, amount).lent : 0,
        isPaid: Boolean(item.isPaid),
        isPending: Boolean(isPastDueUnpaid),
        isActual: false,
        itemId: item.id || item._id || null,
        transactionId: isPlannedTx ? (item.id || item._id || null) : null,
        accountType: acctType,
        bankAccountId: bankId,
        walletId: wallId
      });
    } else if (item.type === 'recurring') {
      const targetDay = clampDayToMonth(item.dayOfMonth ?? 1, daysInMonth);
      const targetDate = formatDate(year, monthNum, targetDay);
      const amount = Math.round(item.amount ?? 0);
      let effectiveDay = targetDay;
      if (item.isPaid === true) {
        if (currentDay !== null && currentDay !== undefined && currentDay >= 1) {
          effectiveDay = Math.min(targetDay, currentDay);
        }
      } else if (item.isPaid === false) {
        if (currentDay !== null && currentDay !== undefined && targetDay < currentDay) {
          effectiveDay = getNextRecommendedDayForPending(Math.abs(amount));
        }
      }
      const isPastDueUnpaid = item.isPaid === false && currentDay !== null && currentDay !== undefined && targetDay < currentDay;
      const effectiveDate = effectiveDay < 0
        ? getDateFromRelativeDay(effectiveDay, year, monthNum)
        : formatDate(year, monthNum, effectiveDay);

      rawEvents.push({
        day: effectiveDay,
        date: effectiveDate,
        originalDay: (typeof item.originalDay === 'number') ? item.originalDay : targetDay,
        originalDate: item.originalDate || targetDate,
        label: item.name,
        name: item.name,
        category: item.category || item.tag || 'General',
        description: item.name,
        amount: -Math.abs(amount),
        priority,
        sourceIndex: index,
        itemType: 'recurring',
        isCardSpend: Boolean(plannedCardId),
        cardAccountId: plannedCardId,
        isFixed: Boolean(item.isFixed),
        isPaid: Boolean(item.isPaid),
        isPending: Boolean(isPastDueUnpaid),
        isActual: false,
        itemId: item.id || item._id || null,
        accountType: acctType,
        bankAccountId: bankId,
        walletId: wallId
      });
    } else if (item.type === 'fuel-log') {
      const stops = Array.isArray(item.fuelStops) ? item.fuelStops : [];
      stops.forEach((stop, sIdx) => {
        if (stop.fuelCost && stop.fuelCost > 0) {
          let stopDay = 1;
          let stopDate = stop.date || formatDate(year, monthNum, 1);
          if (stop.date) {
            stopDay = getRelativeDay(stop.date, year, monthNum);
            if (stopDay > 0) stopDay = clampDayToMonth(stopDay, daysInMonth);
            stopDate = stop.date;
          }
          rawEvents.push({
            day: stopDay,
            date: stopDate,
            label: `${item.name} (${stop.fuelVolume || 0}L)`,
            amount: -Math.abs(Math.round(stop.fuelCost)),
            priority,
            sourceIndex: index * 100 + sIdx,
            itemType: 'fuel-log',
            isActual: true,
            itemId: item.id || item._id || null,
            accountType: acctType,
            bankAccountId: bankId,
            walletId: wallId
          });
        }
      });
    }
  });

  // 4. Generate Events from Logged Transactions (Actuals)
  let totalUnplannedSpent = 0;
  (transactions || []).forEach((tx, txIndex) => {
    // Skip cancelled transactions and planned transactions (handled in plannedRecords)
    if (tx.status === 'cancelled' || tx.status === 'planned') {
      return;
    }
    // If this transaction was already fulfilled as the main salary event, skip to avoid double counting
    if (salaryTx && isSameTransaction(tx, salaryTx)) {
      return;
    }
    if (tx.origin === 'transfer') {
      let txDay = 1;
      let txDate = tx.date || formatDate(year, monthNum, 1);
      if (tx.date) {
        txDay = getRelativeDay(tx.date, year, monthNum);
        if (txDay > 0) txDay = clampDayToMonth(txDay, daysInMonth);
        txDate = tx.date;
      }
      const txAmount = Math.abs(Math.round(Number(tx.amount) || 0));
      if (txAmount <= 0) return;

      const sAccId = normalizeId(tx.accountId || tx.sourceAccountId || tx.sourceBankAccountId || tx.sourceWalletId);
      const dAccId = normalizeId(tx.destinationAccountId || tx.destinationBankAccountId || tx.destinationWalletId);

      const eventLabel = tx.note ? `Transfer: ${tx.note}` : (tx.name || 'Inter-Account Transfer');

      // If simulating an isolated single account, transfer is cash inflow (+txAmount) or outflow (-txAmount)
      const isSingleAccount = normalizedAccounts.length === 1;
      let eventAmount = 0;
      if (isSingleAccount) {
        const singleAccId = String(normalizedAccounts[0].id);
        const isDst = dAccId && String(dAccId) === singleAccId;
        const isSrc = sAccId && String(sAccId) === singleAccId;
        if (isDst) eventAmount = txAmount;
        else if (isSrc) eventAmount = -txAmount;
      }
      // Paying a card bill moves cash out of the bank; a cash advance moves cash in
      const srcIsCard = isCardId(sAccId);
      const dstIsCard = isCardId(dAccId);
      if (!isSingleAccount) {
        if (dstIsCard && !srcIsCard) eventAmount = -txAmount;
        else if (srcIsCard && !dstIsCard) eventAmount = txAmount;
      }

      rawEvents.push({
        day: txDay,
        date: txDate,
        label: eventLabel,
        name: tx.name || eventLabel,
        category: 'Transfer',
        tag: 'Transfer',
        description: tx.note || eventLabel,
        amount: eventAmount, // Zero-sum on aggregate, +/- for single account
        priority: 0,
        sourceIndex: 1000 + txIndex,
        itemType: 'transfer',
        isActual: true,
        transactionId: tx.id || tx._id || null,
        transferId: tx.transferId ? String(tx.transferId) : (tx.id || tx._id ? String(tx.id || tx._id) : null),
        transferAmount: txAmount,
        sourceIsCard: srcIsCard,
        destinationIsCard: dstIsCard,
        cardSourceId: srcIsCard ? sAccId : null,
        cardDestinationId: dstIsCard ? dAccId : null,
        sourceBankAccountId: sAccId,
        sourceAccountId: sAccId,
        destinationBankAccountId: dAccId,
        destinationAccountId: dAccId,
        origin: 'transfer'
      });
      return;
    }

    let txDay = 1;
    let txDate = tx.date || formatDate(year, monthNum, 1);
    if (tx.date) {
      txDay = getRelativeDay(tx.date, year, monthNum);
      if (txDay > 0) txDay = clampDayToMonth(txDay, daysInMonth);
      txDate = tx.date;
    }

    if (isPassThrough(tx)) {
      // Held & Lent: real cash movement on the account, never income or expense
      const ptAmount = Math.abs(Math.round(Number(tx.amount) || 0));
      if (ptAmount <= 0) return;
      const sign = passThroughCashSign(tx.origin);
      const deltas = passThroughDeltas(tx.origin, ptAmount);
      const ptBankRaw = normalizeId(tx.bankAccountId || tx.accountId);
      const ptWallRaw = normalizeId(tx.walletId);
      const ptKnownBank = ptBankRaw && normalizedAccounts.some((a) => a.id === ptBankRaw || a.altId === ptBankRaw);
      const ptKnownWall = ptWallRaw && normalizedAccounts.some((a) => a.id === ptWallRaw || a.altId === ptWallRaw);
      const ptBankId = ptKnownBank ? ptBankRaw : (!ptKnownWall ? (primaryBankId || designatedSalaryBankId) : null);
      const ptWallId = ptKnownWall ? ptWallRaw : null;
      const ptVerbs = {
        held_in: 'Holding for',
        held_return: 'Returned to',
        lent_out: 'Lent to',
        lent_repaid: 'Repaid by'
      };
      const who = tx.personName || '';
      const ptLabel = who ? `${ptVerbs[tx.origin]} ${who}` : (tx.name || ptVerbs[tx.origin]);
      rawEvents.push({
        day: txDay,
        date: txDate,
        label: ptLabel,
        name: tx.name || ptLabel,
        category: 'Held & Lent',
        tag: 'Held & Lent',
        description: tx.note || ptLabel,
        amount: sign * ptAmount,
        priority: sign > 0 ? -Infinity : 0,
        sourceIndex: 1000 + txIndex,
        itemType: 'pass-through',
        passThroughKind: tx.origin,
        personFundId: tx.personFundId || null,
        heldDelta: deltas.held,
        lentDelta: deltas.lent,
        isActual: true,
        transactionId: tx.id || tx._id || null,
        accountType: ptBankId ? 'bank' : (ptWallId ? 'wallet' : null),
        bankAccountId: ptBankId,
        walletId: ptWallId,
        origin: tx.origin
      });
      return;
    }

    const txAmount = Math.round(Number(tx.amount) || 0);
    const isIncomeTx = Boolean(tx.isIncome);
    let eventAmount = 0;
    let itemType = 'unplanned-transaction';

    if (isIncomeTx) {
      eventAmount = Math.abs(txAmount);
      itemType = 'actual-income';
    } else {
      eventAmount = txAmount > 0 ? -txAmount : Math.abs(txAmount);
      // A paid planned bill keeps its planned identity: either it links to a
      // budget item (plannedItemId) or it was created as a planned transaction
      // (origin 'planned') and settled in place. Neither is unplanned spending.
      const isSettledPlan = Boolean(tx.plannedItemId) || tx.origin === 'planned';
      if (!isSettledPlan) {
        totalUnplannedSpent += txAmount;
      }
      itemType = isSettledPlan
        ? (txAmount < 0 ? 'actual-refund' : 'actual-matched')
        : 'unplanned-transaction';
    }

    const labelPrefix = txAmount < 0 ? 'Refund: ' : (isIncomeTx ? 'Income: ' : '');
    const eventLabel = tx.note
      ? `${labelPrefix}${tx.note} (${tx.tag || (isIncomeTx ? 'Income' : 'Expense')})`
      : `${labelPrefix}${tx.tag || (txAmount < 0 ? 'Refund' : (isIncomeTx ? 'Income' : 'Unplanned expense'))}`;

    const rawTxBankId = normalizeId(tx.bankAccountId || tx.accountId);
    const rawTxWallId = normalizeId(tx.walletId);
    const txCardId = isCardId(rawTxBankId) ? rawTxBankId : null;
    const isKnownTxBank = rawTxBankId && normalizedAccounts.some((a) => a.id === rawTxBankId || a.altId === rawTxBankId);
    const isKnownTxWall = rawTxWallId && normalizedAccounts.some((a) => a.id === rawTxWallId || a.altId === rawTxWallId);
    const bankId = txCardId ? null : (isKnownTxBank ? rawTxBankId : (!isKnownTxWall ? (primaryBankId || designatedSalaryBankId) : null));
    const wallId = txCardId ? null : (isKnownTxWall ? rawTxWallId : null);
    const acctType = tx.accountType || (bankId ? 'bank' : (wallId ? 'wallet' : null));

    rawEvents.push({
      day: txDay,
      date: txDate,
      label: eventLabel,
      name: tx.note || tx.description || tx.name || eventLabel,
      category: tx.category || tx.tag || (isIncomeTx ? 'Income' : 'General'),
      tag: tx.tag || tx.category || (isIncomeTx ? 'Income' : 'General'),
      description: tx.note || tx.description || tx.name || eventLabel,
      amount: eventAmount,
      priority: isIncomeTx ? -Infinity : 0,
      sourceIndex: 1000 + txIndex,
      itemType,
      isActual: true,
      transactionId: tx.id || tx._id || null,
      plannedItemId: tx.plannedItemId || null,
      // A card swipe is spending today, paid from cash only when the bill is paid
      isCardSpend: Boolean(txCardId),
      cardAccountId: txCardId,
      accountType: txCardId ? 'credit_card' : acctType,
      bankAccountId: bankId,
      walletId: wallId,
      isIncome: isIncomeTx,
      transferId: tx.transferId ? String(tx.transferId) : null
    });
  });

  // 5. Generate Events from Paired Account Transfers (Zero-sum on aggregate)
  (transfersInput || []).forEach((tr, trIndex) => {
    const trId = tr.id ? String(tr.id) : (tr._id ? String(tr._id) : null);
    if (trId && rawEvents.some((e) => e.itemType === 'transfer' && (String(e.transferId) === trId || String(e.transactionId) === trId))) {
      return;
    }
    let trDay = 1;
    let trDate = tr.date || formatDate(year, monthNum, 1);
    if (tr.date) {
      trDay = getRelativeDay(tr.date, year, monthNum);
      if (trDay > 0) trDay = clampDayToMonth(trDay, daysInMonth);
      trDate = tr.date;
    }

    const trAmount = Math.round(Number(tr.amount) || 0);
    if (trAmount <= 0) return;

    const sAccId = tr.sourceAccountId
      ? String(tr.sourceAccountId._id || tr.sourceAccountId.id || tr.sourceAccountId)
      : (tr.fromAccountId ? String(tr.fromAccountId) : null);
    const dAccId = tr.destinationAccountId
      ? String(tr.destinationAccountId._id || tr.destinationAccountId.id || tr.destinationAccountId)
      : (tr.toAccountId ? String(tr.toAccountId) : null);

    const sBankId = tr.sourceBankAccountId
      ? String(tr.sourceBankAccountId._id || tr.sourceBankAccountId.id || tr.sourceBankAccountId)
      : ((tr.sourceType === 'bank' || !tr.sourceType) && sAccId ? sAccId : null);
    const sWalletId = tr.sourceWalletId
      ? String(tr.sourceWalletId._id || tr.sourceWalletId.id || tr.sourceWalletId)
      : (tr.sourceType === 'wallet' && sAccId ? sAccId : null);
    const dBankId = tr.destinationBankAccountId
      ? String(tr.destinationBankAccountId._id || tr.destinationBankAccountId.id || tr.destinationBankAccountId)
      : ((tr.destinationType === 'bank' || !tr.destinationType) && dAccId ? dAccId : null);
    const dWalletId = tr.destinationWalletId
      ? String(tr.destinationWalletId._id || tr.destinationWalletId.id || tr.destinationWalletId)
      : (tr.destinationType === 'wallet' && dAccId ? dAccId : null);

    const eventLabel = tr.note ? `Transfer: ${tr.note}` : 'Paired Account Transfer';

    // If simulating an isolated single account, transfer is an actual cash inflow (+trAmount) or outflow (-trAmount)
    const isSingleAccount = normalizedAccounts.length === 1;
    let eventAmount = 0;
    if (isSingleAccount) {
      const singleAccId = String(normalizedAccounts[0].id);
      const isDst = (dBankId && String(dBankId) === singleAccId) ||
                    (dWalletId && String(dWalletId) === singleAccId) ||
                    (dAccId && String(dAccId) === singleAccId);
      const isSrc = (sBankId && String(sBankId) === singleAccId) ||
                    (sWalletId && String(sWalletId) === singleAccId) ||
                    (sAccId && String(sAccId) === singleAccId);
      if (isDst) eventAmount = trAmount;
      else if (isSrc) eventAmount = -trAmount;
    }
    const trSrcId = sAccId || sBankId || sWalletId;
    const trDstId = dAccId || dBankId || dWalletId;
    const trSrcIsCard = isCardId(trSrcId);
    const trDstIsCard = isCardId(trDstId);
    if (!isSingleAccount) {
      if (trDstIsCard && !trSrcIsCard) eventAmount = -trAmount;
      else if (trSrcIsCard && !trDstIsCard) eventAmount = trAmount;
    }

    rawEvents.push({
      day: trDay,
      date: trDate,
      label: eventLabel,
      amount: eventAmount, // Zero-sum on aggregate, but +/- for single isolated account simulation
      priority: 0,
      sourceIndex: 2000 + trIndex,
      itemType: 'transfer',
      isActual: true,
      transferId: tr.id || tr._id || null,
      transferAmount: trAmount,
      sourceIsCard: trSrcIsCard,
      destinationIsCard: trDstIsCard,
      cardSourceId: trSrcIsCard ? trSrcId : null,
      cardDestinationId: trDstIsCard ? trDstId : null,
      sourceType: tr.sourceType,
      sourceBankAccountId: sBankId,
      sourceWalletId: sWalletId,
      destinationType: tr.destinationType,
      destinationBankAccountId: dBankId,
      destinationWalletId: dWalletId
    });
  });

  // 5b. Confirmed card bills not yet paid: a projected cash outflow on the due date
  creditCards.forEach((card, cardIndex) => {
    const bill = card.openBill;
    const remaining = Math.max(0, Math.round(Number(bill?.remaining) || 0));
    if (!bill || remaining <= 0 || !bill.dueDate) return;
    if (bill.dueDate > formatDate(year, monthNum, daysInMonth)) return; // due in a later month
    let billDay = getRelativeDay(bill.dueDate, year, monthNum);
    const isOverdue = typeof currentDay === 'number' && currentDay >= 1 && billDay < currentDay;
    if (billDay < 1 || isOverdue) {
      if (!(typeof currentDay === 'number' && currentDay >= 1)) return;
      billDay = currentDay;
    }
    const payFrom = normalizeId(card.payFromAccountId);
    const payFromKnown = payFrom && normalizedAccounts.some((a) => a.id === payFrom || a.altId === payFrom);
    const payFromAcc = payFromKnown ? normalizedAccounts.find((a) => a.id === payFrom || a.altId === payFrom) : null;
    const isWalletPayer = payFromAcc && payFromAcc.type === 'wallet';
    rawEvents.push({
      day: billDay,
      date: formatDate(year, monthNum, billDay),
      originalDate: bill.dueDate,
      label: `${card.name || 'Card'} bill`,
      name: `${card.name || 'Card'} bill`,
      category: 'Card bill',
      tag: 'Card bill',
      description: isOverdue ? `${card.name || 'Card'} bill (overdue)` : `${card.name || 'Card'} bill`,
      amount: -remaining,
      priority: 0,
      sourceIndex: 3000 + cardIndex,
      itemType: 'card-bill',
      isActual: false,
      isPending: isOverdue,
      cardPaymentFor: card.id,
      statementId: bill.statementId || null,
      accountType: isWalletPayer ? 'wallet' : 'bank',
      bankAccountId: isWalletPayer ? null : (payFromKnown ? payFrom : (primaryBankId || designatedSalaryBankId)),
      walletId: isWalletPayer ? payFrom : null
    });
  });

  // 6. Stable Sort:
  // Day ascending -> Priority ascending -> Source index ascending
  rawEvents.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sourceIndex - b.sourceIndex;
  });

  // 7. Calculate Running Balances
  let currentBalance = effectiveOpeningBalance;
  let lowestBalance = rawEvents.length > 0 ? Infinity : effectiveOpeningBalance;
  let lowestDate = formatDate(year, monthNum, 1);

  // Initialize account running balances and canonical ID resolution
  const canonicalAccountIdMap = {};
  normalizedAccounts.forEach((acc) => {
    canonicalAccountIdMap[acc.id] = acc.id;
    if (acc.altId) {
      canonicalAccountIdMap[acc.altId] = acc.id;
    }
  });
  const getCanonicalAccId = (id) => {
    const nId = normalizeId(id);
    return nId ? (canonicalAccountIdMap[nId] || nId) : null;
  };

  const accountRunningBalances = {};
  const accountLowestBalances = {};
  const accountLowestDates = {};
  const accountInitialBalances = {};

  normalizedAccounts.forEach((acc) => {
    const accId = acc.id;
    accountRunningBalances[accId] = acc.openingBalance;
    accountLowestBalances[accId] = acc.openingBalance;
    accountLowestDates[accId] = formatDate(year, monthNum, 1);
    accountInitialBalances[accId] = acc.openingBalance;
  });

  let unassignedRunningBalance = unassignedOpening;
  let unassignedLowestBalance = unassignedOpening;

  // Held & Lent running totals (aggregate and per account)
  const accountHeldOpening = {};
  normalizedAccounts.forEach((acc) => {
    const raw = heldOpeningByAccountInput[acc.id] ?? (acc.altId ? heldOpeningByAccountInput[acc.altId] : undefined);
    accountHeldOpening[acc.id] = Math.max(0, Math.round(Number(raw) || 0));
  });
  let heldRunning = heldOpeningBalance;
  let lentRunning = lentOpeningBalance;
  const accountHeldRunning = { ...accountHeldOpening };
  // Opening low points measure your own money too

  normalizedAccounts.forEach((acc) => {
    accountLowestBalances[acc.id] = acc.openingBalance - (accountHeldOpening[acc.id] || 0);
  });

  // What you owe on each card, as events happen
  const cardRunning = {};
  creditCards.forEach((c) => {
    cardRunning[c.id] = Math.round(Number(c.openingOutstanding) || 0);
  });
  const totalCardLiability = () => Object.values(cardRunning).reduce((sum, v) => sum + Math.max(0, v), 0);

  const events = rawEvents.map((evt) => {
    currentBalance += evt.isCardSpend ? 0 : evt.amount;
    const balanceAfter = currentBalance;
    if (evt.heldDelta) heldRunning = Math.max(0, heldRunning + evt.heldDelta);
    if (evt.lentDelta) lentRunning = Math.max(0, lentRunning + evt.lentDelta);
    if (evt.isCardSpend && evt.cardAccountId && cardRunning[evt.cardAccountId] !== undefined) {
      cardRunning[evt.cardAccountId] -= evt.amount; // spend is negative, a card refund positive
    }
    if (evt.itemType === 'transfer') {
      if (evt.cardDestinationId && cardRunning[evt.cardDestinationId] !== undefined) cardRunning[evt.cardDestinationId] -= evt.transferAmount;
      if (evt.cardSourceId && cardRunning[evt.cardSourceId] !== undefined) cardRunning[evt.cardSourceId] += evt.transferAmount;
    }
    if (evt.cardPaymentFor && cardRunning[evt.cardPaymentFor] !== undefined) {
      cardRunning[evt.cardPaymentFor] -= Math.abs(evt.amount);
    }

    // Floor checks use your own money: the balance minus what you hold for others
    if (balanceAfter - heldRunning < lowestBalance) {
      lowestBalance = balanceAfter - heldRunning;
      lowestDate = evt.date;
    }

    let accountBalanceAfter = null;
    let sourceAccountBalanceAfter = null;
    let destinationAccountBalanceAfter = null;
    let targetBankId = null;

    if (evt.itemType === 'transfer') {
      const trAmt = evt.transferAmount;
      const sBank = getCanonicalAccId(evt.sourceBankAccountId || evt.sourceAccountId);
      const sWall = getCanonicalAccId(evt.sourceWalletId);
      const dBank = getCanonicalAccId(evt.destinationBankAccountId || evt.destinationAccountId);
      const dWall = getCanonicalAccId(evt.destinationWalletId);

      // Debit source
      if (sBank && accountRunningBalances[sBank] !== undefined) {
        accountRunningBalances[sBank] -= trAmt;
        sourceAccountBalanceAfter = accountRunningBalances[sBank];
      } else if (sWall && accountRunningBalances[sWall] !== undefined) {
        accountRunningBalances[sWall] -= trAmt;
        sourceAccountBalanceAfter = accountRunningBalances[sWall];
      } else if (!evt.sourceIsCard) {
        unassignedRunningBalance -= trAmt;
        sourceAccountBalanceAfter = unassignedRunningBalance;
      }

      // Credit destination
      if (dBank && accountRunningBalances[dBank] !== undefined) {
        accountRunningBalances[dBank] += trAmt;
        destinationAccountBalanceAfter = accountRunningBalances[dBank];
      } else if (dWall && accountRunningBalances[dWall] !== undefined) {
        accountRunningBalances[dWall] += trAmt;
        destinationAccountBalanceAfter = accountRunningBalances[dWall];
      } else if (!evt.destinationIsCard) {
        unassignedRunningBalance += trAmt;
        destinationAccountBalanceAfter = unassignedRunningBalance;
      }
    } else if (evt.isCardSpend) {
      // Card swipe: owed on the card, no cash account moves yet
    } else {
      const bId = getCanonicalAccId(evt.bankAccountId);
      const wId = getCanonicalAccId(evt.walletId);
      const defaultBankTarget = getCanonicalAccId(primaryBankId || designatedSalaryBankId);

      targetBankId = (bId && accountRunningBalances[bId] !== undefined)
        ? bId
        : ((!wId || accountRunningBalances[wId] === undefined) ? defaultBankTarget : null);

      if (targetBankId && accountRunningBalances[targetBankId] !== undefined) {
        accountRunningBalances[targetBankId] += evt.amount;
        accountBalanceAfter = accountRunningBalances[targetBankId];
        if (evt.heldDelta) accountHeldRunning[targetBankId] = Math.max(0, (accountHeldRunning[targetBankId] || 0) + evt.heldDelta);
      } else if (wId && accountRunningBalances[wId] !== undefined) {
        accountRunningBalances[wId] += evt.amount;
        accountBalanceAfter = accountRunningBalances[wId];
        if (evt.heldDelta) accountHeldRunning[wId] = Math.max(0, (accountHeldRunning[wId] || 0) + evt.heldDelta);
      } else {
        unassignedRunningBalance += evt.amount;
        accountBalanceAfter = unassignedRunningBalance;
      }
    }

    // Update lowest balances and dates per account
    normalizedAccounts.forEach((acc) => {
      const accId = acc.id;
      const accOwn = accountRunningBalances[accId] - (accountHeldRunning[accId] || 0);
      if (accOwn < accountLowestBalances[accId]) {
        accountLowestBalances[accId] = accOwn;
        accountLowestDates[accId] = evt.date;
      }
    });

    if (unassignedRunningBalance < unassignedLowestBalance) {
      unassignedLowestBalance = unassignedRunningBalance;
    }

    return {
      date: evt.date,
      day: evt.day,
      originalDay: evt.originalDay ?? evt.day,
      originalDate: evt.originalDate ?? evt.date,
      label: evt.label,
      name: evt.name || evt.label || '',
      description: evt.description || evt.note || evt.label || '',
      category: evt.category || evt.tag || (evt.isSalary ? 'Salary' : (evt.amount > 0 ? 'Income' : 'General')),
      tag: evt.tag || evt.category || (evt.isSalary ? 'Salary' : (evt.amount > 0 ? 'Income' : 'General')),
      amount: evt.amount,
      balanceAfter,
      accountBalanceAfter: accountBalanceAfter !== null
        ? accountBalanceAfter
        : (sourceAccountBalanceAfter !== null ? sourceAccountBalanceAfter : destinationAccountBalanceAfter),
      sourceAccountBalanceAfter,
      destinationAccountBalanceAfter,
      itemType: evt.itemType,
      isSalary: Boolean(evt.isSalary),
      isIncome: Boolean(evt.isIncome || (evt.amount > 0 && (evt.itemType === 'income' || evt.itemType === 'salary'))),
      isFixed: evt.isFixed,
      isPaid: evt.isPaid,
      isPending: evt.isPending,
      isActual: evt.isActual,
      itemId: evt.itemId || null,
      transactionId: evt.transactionId || null,
      plannedItemId: evt.plannedItemId || null,
      accountId: evt.accountId || evt.bankAccountId || evt.walletId || (targetBankId ? targetBankId : null),
      accountType: evt.accountType || null,
      bankAccountId: evt.bankAccountId || null,
      walletId: evt.walletId || null,
      transferId: evt.transferId || null,
      transferAmount: evt.transferAmount || null,
      sourceType: evt.sourceType || null,
      sourceAccountId: evt.sourceAccountId || evt.sourceBankAccountId || null,
      sourceBankAccountId: evt.sourceBankAccountId || null,
      sourceWalletId: evt.sourceWalletId || null,
      destinationType: evt.destinationType || null,
      destinationAccountId: evt.destinationAccountId || evt.destinationBankAccountId || null,
      destinationBankAccountId: evt.destinationBankAccountId || null,
      destinationWalletId: evt.destinationWalletId || null,
      origin: evt.origin || null,
      passThroughKind: evt.passThroughKind || null,
      personFundId: evt.personFundId || null,
      heldAfter: heldRunning,
      lentAfter: lentRunning,
      isCardSpend: Boolean(evt.isCardSpend),
      cardAccountId: evt.cardAccountId || null,
      cardPaymentFor: evt.cardPaymentFor || null,
      sourceIsCard: Boolean(evt.sourceIsCard),
      destinationIsCard: Boolean(evt.destinationIsCard),
      cardSourceId: evt.cardSourceId || null,
      cardDestinationId: evt.cardDestinationId || null,
      statementId: evt.statementId || null,
      cardLiabilityAfter: totalCardLiability(),
      cardBalances: { ...cardRunning },
      accountHeld: { ...accountHeldRunning },
      accountBalances: { ...accountRunningBalances }
    };
  });

  const endingBalance = currentBalance;

  if (events.length === 0) {
    lowestBalance = endingBalance - heldOpeningBalance;
    lowestDate = formatDate(year, monthNum, daysInMonth);
  }

  const floorBreached = lowestBalance < safetyFloor;

  // 8. Daily balance points (minNegativeDay to daysInMonth)
  const minNegativeDay = rawEvents.length > 0 && rawEvents[0].day < 0
    ? rawEvents[0].day
    : 1;

  const dailyBalances = [];
  const accountDailyBalances = {};
  normalizedAccounts.forEach((acc) => {
    accountDailyBalances[acc.id] = [];
  });
  accountDailyBalances['unassigned'] = [];

  let dayBalance = effectiveOpeningBalance;
  const currentDayAccBalances = {};
  normalizedAccounts.forEach((acc) => {
    currentDayAccBalances[acc.id] = accountInitialBalances[acc.id];
  });
  let currentUnassignedDayBalance = unassignedOpening;

  // Held-for-others amount at the close of each day (aggregate and per account)
  const heldByDay = {};
  const accountHeldByDay = {};
  normalizedAccounts.forEach((acc) => {
    accountHeldByDay[acc.id] = {};
  });
  let dayHeld = heldOpeningBalance;
  let dayAccHeld = { ...accountHeldOpening };
  const cardOpeningBalances = {};
  creditCards.forEach((c) => {
    cardOpeningBalances[c.id] = Math.round(Number(c.openingOutstanding) || 0);
  });
  const cardBalancesByDay = {};
  let dayCardBalances = { ...cardOpeningBalances };

  let eventIdx = 0;
  for (let d = minNegativeDay; d <= daysInMonth; d++) {
    if (d === 0) continue; // Calendar skips Day 0 between Day -1 and Day 1

    const dateStr = getDateFromRelativeDay(d, year, monthNum);
    const dayEventsList = [];
    const dayAccountEvents = {};
    normalizedAccounts.forEach((acc) => {
      dayAccountEvents[acc.id] = [];
    });
    dayAccountEvents['unassigned'] = [];

    while (eventIdx < events.length && events[eventIdx].day === d) {
      const e = events[eventIdx];
      dayBalance = e.balanceAfter;
      dayHeld = e.heldAfter;
      dayAccHeld = e.accountHeld;
      dayCardBalances = e.cardBalances;
      dayEventsList.push(e);

      if (e.itemType === 'transfer') {
        const trAmt = e.transferAmount;
        const sBank = getCanonicalAccId(e.sourceBankAccountId);
        const sWall = getCanonicalAccId(e.sourceWalletId);
        const dBank = getCanonicalAccId(e.destinationBankAccountId);
        const dWall = getCanonicalAccId(e.destinationWalletId);

        if (sBank && currentDayAccBalances[sBank] !== undefined) {
          currentDayAccBalances[sBank] -= trAmt;
          if (dayAccountEvents[sBank]) {
            dayAccountEvents[sBank].push({
              ...e,
              amount: -trAmt,
              balanceAfter: currentDayAccBalances[sBank],
              accountBalanceAfter: currentDayAccBalances[sBank]
            });
          }
        } else if (sWall && currentDayAccBalances[sWall] !== undefined) {
          currentDayAccBalances[sWall] -= trAmt;
          if (dayAccountEvents[sWall]) {
            dayAccountEvents[sWall].push({
              ...e,
              amount: -trAmt,
              balanceAfter: currentDayAccBalances[sWall],
              accountBalanceAfter: currentDayAccBalances[sWall]
            });
          }
        } else if (!e.sourceIsCard) {
          currentUnassignedDayBalance -= trAmt;
          dayAccountEvents['unassigned'].push({
            ...e,
            amount: -trAmt,
            balanceAfter: currentUnassignedDayBalance,
            accountBalanceAfter: currentUnassignedDayBalance
          });
        }

        if (dBank && currentDayAccBalances[dBank] !== undefined) {
          currentDayAccBalances[dBank] += trAmt;
          if (dayAccountEvents[dBank]) {
            dayAccountEvents[dBank].push({
              ...e,
              amount: trAmt,
              balanceAfter: currentDayAccBalances[dBank],
              accountBalanceAfter: currentDayAccBalances[dBank]
            });
          }
        } else if (dWall && currentDayAccBalances[dWall] !== undefined) {
          currentDayAccBalances[dWall] += trAmt;
          if (dayAccountEvents[dWall]) {
            dayAccountEvents[dWall].push({
              ...e,
              amount: trAmt,
              balanceAfter: currentDayAccBalances[dWall],
              accountBalanceAfter: currentDayAccBalances[dWall]
            });
          }
        } else if (!e.destinationIsCard) {
          currentUnassignedDayBalance += trAmt;
          dayAccountEvents['unassigned'].push({
            ...e,
            amount: trAmt,
            balanceAfter: currentUnassignedDayBalance,
            accountBalanceAfter: currentUnassignedDayBalance
          });
        }
      } else if (e.isCardSpend) {
        // Card swipe: no cash account moves
      } else {
        const bId = getCanonicalAccId(e.bankAccountId);
        const wId = getCanonicalAccId(e.walletId);
        const defaultBankTarget = getCanonicalAccId(primaryBankId || designatedSalaryBankId);

        const targetBankId = (bId && currentDayAccBalances[bId] !== undefined)
          ? bId
          : ((!wId || currentDayAccBalances[wId] === undefined) ? defaultBankTarget : null);

        if (targetBankId && currentDayAccBalances[targetBankId] !== undefined) {
          currentDayAccBalances[targetBankId] += e.amount;
          if (dayAccountEvents[targetBankId]) {
            dayAccountEvents[targetBankId].push({
              ...e,
              balanceAfter: currentDayAccBalances[targetBankId],
              accountBalanceAfter: currentDayAccBalances[targetBankId]
            });
          }
        } else if (wId && currentDayAccBalances[wId] !== undefined) {
          currentDayAccBalances[wId] += e.amount;
          if (dayAccountEvents[wId]) {
            dayAccountEvents[wId].push({
              ...e,
              balanceAfter: currentDayAccBalances[wId],
              accountBalanceAfter: currentDayAccBalances[wId]
            });
          }
        } else {
          currentUnassignedDayBalance += e.amount;
          dayAccountEvents['unassigned'].push({
            ...e,
            balanceAfter: currentUnassignedDayBalance,
            accountBalanceAfter: currentUnassignedDayBalance
          });
        }
      }

      eventIdx++;
    }

    heldByDay[d] = dayHeld;
    cardBalancesByDay[d] = dayCardBalances;
    normalizedAccounts.forEach((acc) => {
      accountHeldByDay[acc.id][d] = dayAccHeld[acc.id] || 0;
    });

    dailyBalances.push({
      day: d,
      date: dateStr,
      balance: dayBalance,
      heldForOthers: dayHeld,
      intradayEvents: dayEventsList
    });

    normalizedAccounts.forEach((acc) => {
      accountDailyBalances[acc.id].push({
        day: d,
        date: dateStr,
        balance: currentDayAccBalances[acc.id],
        heldForOthers: dayAccHeld[acc.id] || 0,
        intradayEvents: dayAccountEvents[acc.id] || []
      });
    });

    accountDailyBalances['unassigned'].push({
      day: d,
      date: dateStr,
      balance: currentUnassignedDayBalance,
      intradayEvents: dayAccountEvents['unassigned'] || []
    });
  }

  // 9. Calculate Today's Balance
  let todayBalance = endingBalance;
  if (currentDay === 0) {
    todayBalance = (isSalaryMarkedCredited || salaryTx)
      ? (effectiveOpeningBalance + effectiveSalaryAmount)
      : effectiveOpeningBalance;
  } else if (currentDay !== null) {
    const todayPoint = dailyBalances.find((p) => p.day === currentDay);
    todayBalance = todayPoint ? todayPoint.balance : endingBalance;
  }

  // Your own money on each day: the balance minus what you hold for others
  const toOwnPoints = (points, byDay) => (points || []).map((p) => ({
    day: p.day,
    date: p.date,
    balance: p.balance - Math.max(0, (byDay && byDay[p.day]) || 0)
  }));

  // Money held for others as of today: ring-fenced out of Safe-to-Spend
  const heldAtDay = (byDay, opening, ending) => {
    if (currentDay === 0) return opening;
    if (currentDay === null) return ending;
    return byDay[currentDay] !== undefined ? byDay[currentDay] : ending;
  };
  const heldEnding = events.length > 0 ? events[events.length - 1].heldAfter : heldOpeningBalance;
  const lentEnding = events.length > 0 ? events[events.length - 1].lentAfter : lentOpeningBalance;
  const heldReserve = heldAtDay(heldByDay, heldOpeningBalance, heldEnding);

  // What you owe on cards today: ring-fenced out of Safe-to-Spend from the swipe day
  const cardEndingBalances = events.length > 0 ? events[events.length - 1].cardBalances : cardOpeningBalances;
  const cardBalancesToday = (() => {
    if (currentDay === 0) return cardOpeningBalances;
    if (currentDay === null) return cardEndingBalances;
    return cardBalancesByDay[currentDay] || cardEndingBalances;
  })();
  const cardReserve = Object.values(cardBalancesToday || {}).reduce((sum, v) => sum + Math.max(0, v), 0);
  const lentToday = (() => {
    if (currentDay === 0) return lentOpeningBalance;
    let lent = lentOpeningBalance;
    events.forEach((e) => {
      if (currentDay === null || e.day <= currentDay) lent = e.lentAfter;
    });
    return lent;
  })();

  // 10. Net item summaries for items with refunds
  const itemNetMap = {};
  items.forEach((item) => {
    const idStr = String(item.id || item._id || '');
    const originalAmount = Math.round(item.amount || 0);
    const refundTotal = itemRefundMap[idStr] || 0;
    const netAmount = Math.max(0, originalAmount - refundTotal);

    itemNetMap[idStr] = {
      originalAmount,
      refundTotal,
      netAmount,
      hasRefund: refundTotal > 0
    };
  });

  // 11. Pace-Adaptive Safe Velocity and Dynamic Allowance
  const effectiveDay = currentDay || 1;
  const daysLeft = Math.max(1, daysInMonth - effectiveDay + 1);
  const daysElapsed = Math.max(1, effectiveDay);

  let committedUpcomingItems = 0;
  events.forEach((evt) => {
    // Consider all upcoming planned expenses as committed bills; strictly future events (day > effectiveDay)
    if (evt.day > effectiveDay && !evt.isActual && evt.amount < 0 && evt.passThroughKind !== 'held_return' && evt.itemType !== 'card-bill') {
      committedUpcomingItems += Math.abs(evt.amount);
    }
  });

  // Goals reserve this month's share (target ÷ months left), not the full target.
  const goalReserveInfo = getGoalMonthlyReserve(goals, { year, month: monthNum });
  const activeGoalsCost = goalReserveInfo.total;

  const { freeSurplus, rate: safeVelocityPerDay } = dailyLimit({
    balance: todayBalance, committed: committedUpcomingItems, floor: safetyFloor, goalReserve: activeGoalsCost, heldReserve, cardReserve, daysLeft
  });

  let totalAllSpentToDate = 0;
  (transactions || []).forEach((tx) => {
    if (salaryTx && isSameTransaction(tx, salaryTx)) {
      return;
    }
    if (!isDiscretionarySpend(tx)) {
      return;
    }
    {
      const txAmt = Math.round(Number(tx.amount) || 0);
      const txDay = getRelativeDay(tx.date, year, monthNum);
      if (txDay <= effectiveDay) {
        totalAllSpentToDate += txAmt;
      }
    }
  });

  const burnRatePerDay = totalAllSpentToDate > 0 ? Math.round(totalAllSpentToDate / daysElapsed) : 0;

  const paceStatus = classifyPace(safeVelocityPerDay, burnRatePerDay);

  const dynamicAllowance = unplannedAllowance > 0
    ? unplannedAllowance
    : (freeSurplus + totalUnplannedSpent);

  const allowanceLeft = unplannedAllowance > 0
    ? (unplannedAllowance - totalUnplannedSpent)
    : freeSurplus;

  const safeToSpendPerDay = unplannedAllowance > 0
    ? Math.max(0, Math.round(allowanceLeft / daysLeft))
    : safeVelocityPerDay;

  // Build rich per-account summaries with isolated velocity and metrics
  const accountSummaries = normalizedAccounts.map((acc) => {
    const accId = acc.id;
    const matchesThisAcc = (id) => id === accId || (acc.altId && id === acc.altId);
    const isDesignatedSalaryBank = matchesThisAcc(getCanonicalAccId(salaryBankAccountId)) ||
                                   matchesThisAcc(getCanonicalAccId(designatedSalaryBankId)) ||
                                   matchesThisAcc(getCanonicalAccId(primaryBankId));

    let accToday = accountRunningBalances[accId];
    if (currentDay === 0) {
      const isThisAccSalaryTarget = isDesignatedSalaryBank;
      const initBal = accountInitialBalances[accId];
      accToday = (isThisAccSalaryTarget && (isSalaryMarkedCredited || salaryTx))
        ? (initBal + effectiveSalaryAmount)
        : initBal;
    } else if (currentDay !== null) {
      const point = (accountDailyBalances[accId] || []).find((p) => p.day === currentDay);
      if (point) accToday = point.balance;
    }

    const minBal = acc.minimumBalance || 0;

    // Per-account income and expenses
    let accIncome = 0;
    let accExpenses = 0;
    let accCommitted = 0;
    events.forEach((evt) => {
      const evtBank = getCanonicalAccId(evt.bankAccountId);
      const evtWall = getCanonicalAccId(evt.walletId);
      const sBank = getCanonicalAccId(evt.sourceBankAccountId);
      const sWall = getCanonicalAccId(evt.sourceWalletId);
      const dBank = getCanonicalAccId(evt.destinationBankAccountId);
      const dWall = getCanonicalAccId(evt.destinationWalletId);

      const isDirectMatch = matchesThisAcc(evtBank) || matchesThisAcc(evtWall);
      const isTransferSrc = matchesThisAcc(sBank) || matchesThisAcc(sWall);
      const isTransferDst = matchesThisAcc(dBank) || matchesThisAcc(dWall);

      const isSalaryTarget = (evt.isSalary || evt.itemType === 'income' || evt.itemType === 'salary') && isDesignatedSalaryBank;
      const isUnassignedExpense = (!evtBank || accountRunningBalances[evtBank] === undefined) &&
                                  (!evtWall || accountRunningBalances[evtWall] === undefined) &&
                                  !sBank && !sWall && isDesignatedSalaryBank;

      const isSrc = isDirectMatch || isTransferSrc || isUnassignedExpense;
      const isDst = isTransferDst || isSalaryTarget || (evt.amount > 0 && isDirectMatch);

      if (evt.isCardSpend) return;
      const isPt = evt.itemType === 'pass-through';
      const isCardMove = evt.itemType === 'card-bill' || evt.sourceIsCard || evt.destinationIsCard;
      if (evt.amount > 0 && isDst && !isPt && !isCardMove) {
        accIncome += evt.amount;
      }
      if (evt.amount < 0 && isSrc) {
        if (!isPt && !isCardMove) accExpenses += Math.abs(evt.amount);
        // Consider all upcoming planned expenses as committed bills; strictly future events (day > effectiveDay)
        if (evt.day > effectiveDay && !evt.isActual && evt.passThroughKind !== 'held_return') {
          accCommitted += Math.abs(evt.amount);
        }
      }
    });

    let accSpentToDate = 0;
    (transactions || []).forEach((tx) => {
      // Exclude main salary transaction from expense burn pace
      if (salaryTx && isSameTransaction(tx, salaryTx)) {
        return;
      }
      // Only discretionary spending counts toward the pace (no bills, goals, transfers)
      if (!isDiscretionarySpend(tx)) {
        return;
      }
      // Card swipes belong to the card, not to a cash account
      if (isCardId(normalizeId(tx.accountId || tx.bankAccountId))) {
        return;
      }

      const txBank = getCanonicalAccId(tx.bankAccountId);
      const txWall = getCanonicalAccId(tx.walletId);

      // Strict account attribution:
      // If tx.accountType is explicitly 'wallet', it only matches this wallet
      // If tx.accountType is explicitly 'bank', it only matches this bank
      // If tx.accountType is unassigned, fallback to designated salary bank if no account matches
      let isTxAcct = false;
      if (tx.accountType === 'wallet') {
        isTxAcct = matchesThisAcc(txWall);
      } else if (tx.accountType === 'bank') {
        isTxAcct = matchesThisAcc(txBank);
      } else {
        const isWalletMatch = matchesThisAcc(txWall);
        const isBankMatch = matchesThisAcc(txBank);
        const isFallback = (!txBank || accountRunningBalances[txBank] === undefined) &&
                           (!txWall || accountRunningBalances[txWall] === undefined) &&
                           isDesignatedSalaryBank;
        isTxAcct = isWalletMatch || isBankMatch || isFallback;
      }

      if (isTxAcct && !tx.isIncome) {
        const txAmt = Math.round(Number(tx.amount) || 0);
        const txDay = getRelativeDay(tx.date, year, monthNum);
        if (txDay <= effectiveDay) {
          accSpentToDate += txAmt;
        }
      }
    });

    // This account's share of goal reserves (goals funded from this account)
    const accGoals = goalReserveInfo.items
      .filter((it) => it.fundingIds.some((fid) => matchesThisAcc(fid)))
      .reduce((sum, it) => sum + it.reserve, 0);

    const accHeldEnding = events.length > 0
      ? ((events[events.length - 1].accountHeld || {})[accId] || 0)
      : (accountHeldOpening[accId] || 0);
    const accHeld = heldAtDay(accountHeldByDay[accId] || {}, accountHeldOpening[accId] || 0, accHeldEnding);

    const { freeSurplus: accFreeSurplus, rate: accSafeVelocity } = dailyLimit({
      balance: accToday, committed: accCommitted, floor: minBal, goalReserve: accGoals, heldReserve: accHeld, daysLeft
    });
    const accBurnRate = accSpentToDate > 0 ? Math.round(accSpentToDate / daysElapsed) : 0;
    const accPaceStatus = classifyPace(accSafeVelocity, accBurnRate);

    const accLows = summarizeLowPoints(toOwnPoints(accountDailyBalances[accId] || [], accountHeldByDay[accId]), {
      currentDay,
      floor: minBal,
      fallbackDate: formatDate(year, monthNum, 1),
      fallbackBalance: (accountInitialBalances[accId] || 0) - (accountHeldOpening[accId] || 0)
    });
    const lowestBal = accLows.lowest.balance;
    const lowestDt = accLows.lowest.date;

    const floorBreached = lowestBal < minBal;

    return {
      id: accId,
      altId: acc.altId || null,
      type: acc.type,
      name: acc.name,
      institution: acc.institution || '',
      accountType: acc.accountType || '',
      accountNumberMasked: acc.accountNumberMasked || '',
      openingBalance: accountInitialBalances[accId],
      endingBalance: accountRunningBalances[accId],
      todayBalance: accToday,
      lowestBalance: lowestBal,
      lowestDate: lowestDt,
      lowestUpcomingBalance: accLows.upcoming.balance,
      lowestUpcomingDate: accLows.upcoming.date,
      pastBreach: accLows.pastBreach,
      minimumBalance: minBal,
      floorBreached,
      heldForOthers: accHeld,
      incomeAmount: accIncome,
      totalExpenses: accExpenses,
      isPrimary: Boolean(acc.isPrimary),
      isArchived: Boolean(acc.isArchived),
      isSalaryCredited: Boolean(isSalaryMarkedCredited || salaryTx),
      salaryCreditedDate: salaryTx ? salaryTx.date : (settings.salaryCreditedDate || (isSalaryMarkedCredited ? formatDate(year, monthNum, 1) : null)),
      safeVelocity: {
        rate: accSafeVelocity,
        safeVelocityPerDay: accSafeVelocity,
        status: accPaceStatus,
        paceStatus: accPaceStatus,
        freeSurplus: accFreeSurplus,
        burnRate: accBurnRate,
        burnRatePerDay: accBurnRate,
        committedBills: accCommitted,
        committedUpcomingItems: accCommitted,
        totalAllowance: accFreeSurplus + accSpentToDate,
        allowanceLeft: accFreeSurplus,
        activeGoalsCost: accGoals,
        heldReserve: accHeld,
        daysLeft,
        daysElapsed
      }
    };
  });

  const { accountsMap, accountSimulations } = indexAccountSummaries(accountSummaries, accountDailyBalances);

  normalizedAccounts.forEach((acc) => {
    if (acc.altId && !accountDailyBalances[acc.altId] && accountDailyBalances[acc.id]) {
      accountDailyBalances[acc.altId] = accountDailyBalances[acc.id];
    }
  });

  const totalLoggedIncome = (transactions || [])
    .filter((t) => t.isIncome && (!salaryTx || (t !== salaryTx && String(t._id || t.id) !== String(salaryTx._id || salaryTx.id))))
    .reduce((sum, t) => sum + Math.round(Number(t.amount) || 0), 0);
  const totalSimIncome = effectiveSalaryAmount + totalLoggedIncome;

  const totalSimExpenses = events
    .filter((e) => e.amount < 0 && e.itemType !== 'transfer' && e.itemType !== 'pass-through' && e.itemType !== 'card-bill')
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const ownDailyBalances = toOwnPoints(dailyBalances, heldByDay);
  const aggLowestBalance = ownDailyBalances.length > 0
    ? Math.min(...ownDailyBalances.map((d) => d.balance))
    : lowestBalance;

  const unifiedLows = summarizeLowPoints(ownDailyBalances, {
    currentDay,
    floor: safetyFloor,
    fallbackDate: lowestDate,
    fallbackBalance: aggLowestBalance
  });

  const aggFloorBreached = accountSummaries.length > 0
    ? (aggLowestBalance < safetyFloor)
    : floorBreached;

  // 11b. Credit cards: what you owe, this cycle, and whether the next bill is payable
  const todayIso = typeof currentDay === 'number' && currentDay >= 1 ? formatDate(year, monthNum, currentDay) : null;
  const ownByDay = {};
  ownDailyBalances.forEach((pt) => {
    ownByDay[pt.day] = pt.balance;
  });
  const ownEnding = ownDailyBalances.length > 0 ? ownDailyBalances[ownDailyBalances.length - 1].balance : (endingBalance - heldEnding);
  const cardBillsUpTo = (day) => events
    .filter((e) => e.itemType === 'card-bill' && (day === null || e.day <= day))
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  // Cash you could put toward card bills on a date, before paying any of them
  const capacityAt = (dueDate) => {
    if (!dueDate || !todayIso) return 0;
    let base;
    if (dueDate > formatDate(year, monthNum, daysInMonth)) {
      const incomeBefore = nextIncome && (!nextIncome.date || nextIncome.date <= dueDate) ? Math.round(Number(nextIncome.amount) || 0) : 0;
      base = ownEnding + cardBillsUpTo(null) + incomeBefore;
    } else {
      const day = Math.max(getRelativeDay(dueDate, year, monthNum), currentDay);
      base = (ownByDay[day] !== undefined ? ownByDay[day] : ownEnding) + cardBillsUpTo(day);
    }
    return base - safetyFloor - activeGoalsCost;
  };

  const cardDrafts = creditCards.map((card) => {
    const outstanding = Math.max(0, Math.round(Number((cardBalancesToday || {})[card.id]) || 0));
    const limit = Math.max(0, Math.round(Number(card.creditLimit) || 0));
    const unbilledSoFar = Math.max(0, Math.round(Number(card.unbilledSoFar) || 0));
    const billedUnpaid = Math.max(0, Math.round(Number(card.openBill?.remaining) || 0));
    const history = Array.isArray(card.history) ? card.history : [];
    let projection = null;
    if (todayIso && card.cycleStart && card.cycleEnd) {
      const daysElapsed = Math.max(1, daysBetween(card.cycleStart, todayIso) + 1);
      const daysRemaining = Math.max(0, daysBetween(todayIso, card.cycleEnd));
      const plannedOnCard = events
        .filter((e) => e.isCardSpend && e.cardAccountId === card.id && !e.isActual && e.amount < 0 && e.date > todayIso && e.date <= card.cycleEnd)
        .reduce((sum, e) => sum + Math.abs(e.amount), 0);
      const spend = projectCycleSpend({ unbilledSoFar, daysElapsed, daysRemaining, history, plannedOnCard });
      projection = { ...spend, daysRemaining, plannedOnCard, projectedBill: billedUnpaid + spend.projected };
    }
    return { card, outstanding, limit, unbilledSoFar, billedUnpaid, history, projection };
  });
  const totalProjected = cardDrafts.reduce((sum, d) => sum + (d.projection ? d.projection.projectedBill : 0), 0);

  const cardSummaries = cardDrafts.map((d) => {
    const { card, outstanding, limit, unbilledSoFar, billedUnpaid, history, projection } = d;
    let payability = null;
    if (projection) {
      // Other cards' bills come out of the same cash
      const othersProjected = totalProjected - projection.projectedBill;
      const dueDate = card.cycleDueDate || card.openBill?.dueDate || null;
      payability = scoreCardPayability({
        billedUnpaid,
        unbilledSoFar,
        projectedCycleSpend: projection.projected,
        capacity: capacityAt(dueDate) - othersProjected,
        daysRemaining: projection.daysRemaining,
        plannedOnCard: projection.plannedOnCard,
        creditLimit: limit,
        outstanding,
        history,
        dueDate,
        currencySymbol: settings.currencySymbol || '₹'
      });
      payability.rate = projection.rate;
      payability.currentRate = projection.currentRate;
      payability.historicalRate = projection.historicalRate;
    }
    return {
      id: card.id,
      name: card.name || 'Card',
      creditLimit: limit,
      outstanding,
      openingOutstanding: Math.round(Number(card.openingOutstanding) || 0),
      endingOutstanding: Math.max(0, Math.round(Number((cardEndingBalances || {})[card.id]) || 0)),
      unbilledSoFar,
      billedUnpaid,
      utilization: limit > 0 ? Math.round((outstanding / limit) * 1000) / 1000 : null,
      availableCredit: limit > 0 ? Math.max(0, limit - outstanding) : null,
      cycleStart: card.cycleStart || null,
      nextStatementDate: card.cycleEnd || null,
      nextDueDate: card.cycleDueDate || null,
      openBill: card.openBill || null,
      payFromAccountId: card.payFromAccountId || null,
      payability
    };
  });

  const cardPayability = (() => {
    const scored = cardSummaries.filter((c) => c.payability);
    if (scored.length === 0) return null;
    const dueDates = scored.map((c) => c.nextDueDate || c.openBill?.dueDate).filter(Boolean).sort();
    const totalLimit = cardSummaries.reduce((sum, c) => sum + c.creditLimit, 0);
    return scoreCardPayability({
      billedUnpaid: cardDrafts.reduce((sum, dd) => sum + dd.billedUnpaid, 0),
      unbilledSoFar: cardDrafts.reduce((sum, dd) => sum + dd.unbilledSoFar, 0),
      projectedCycleSpend: cardDrafts.reduce((sum, dd) => sum + (dd.projection ? dd.projection.projected : 0), 0),
      capacity: capacityAt(dueDates[0] || null),
      daysRemaining: Math.min(...cardDrafts.filter((dd) => dd.projection).map((dd) => dd.projection.daysRemaining)),
      plannedOnCard: cardDrafts.reduce((sum, dd) => sum + (dd.projection ? dd.projection.plannedOnCard : 0), 0),
      creditLimit: totalLimit,
      outstanding: cardReserve,
      history: [],
      dueDate: dueDates[0] || null,
      currencySymbol: settings.currencySymbol || '₹'
    });
  })();

  // 12. One row per day for the chart and the timeline
  const days = buildDayRows(dailyBalances, events, effectiveOpeningBalance, safetyFloor, heldByDay);

  return {
    events,
    allEvents: events,
    dailyBalances,
    days,
    endingBalance,
    todayBalance,
    todaysBalance: todayBalance,
    openingBalance: effectiveOpeningBalance,
    lowestBalance: aggLowestBalance,
    // Date of the same low point the balance comes from (was the event-loop date)
    lowestDate: dailyBalances.length > 0 && unifiedLows.lowest.balance === aggLowestBalance ? unifiedLows.lowest.date : lowestDate,
    lowestUpcomingBalance: unifiedLows.upcoming.balance,
    lowestUpcomingDate: unifiedLows.upcoming.date,
    pastBreach: unifiedLows.pastBreach,
    lowestBalanceDay: (() => {
      const match = days.find((d) => d.date === lowestDate || d.closingBalance === aggLowestBalance);
      return match ? match.day : 1;
    })(),
    safetyFloor,
    floorBreached: aggFloorBreached,
    totalIncome: totalSimIncome,
    incomeAmount: totalSimIncome,
    totalPlannedExpenses: totalSimExpenses,
    // Spending that has actually happened (paid/logged), excluding transfers
    totalActualExpenses: events
      .filter((e) => e.amount < 0 && e.itemType !== 'transfer' && e.itemType !== 'pass-through' && e.itemType !== 'card-bill' && (e.isActual || e.isPaid))
      .reduce((sum, e) => sum + Math.abs(e.amount), 0),
    totalExpenses: totalSimExpenses,
    isSalaryCredited: Boolean(isSalaryMarkedCredited || salaryTx),
    salaryCreditedDate: salaryTx ? salaryTx.date : (settings.salaryCreditedDate || (isSalaryMarkedCredited ? formatDate(year, monthNum, 1) : null)),
    salaryTransactionId: salaryTx ? (salaryTx.id || salaryTx._id || null) : null,
    daysInMonth,
    itemNetMap,
    unplannedAllowance: dynamicAllowance,
    totalUnplannedSpent,
    allowanceLeft,
    daysLeft,
    daysElapsed,
    // One unified daily limit, from unified figures. Summing per-account limits
    // let an account in deficit vanish (each was floored at 0) and ignored the
    // month's own safety floor, which only applies to the total.
    safeToSpendPerDay: accountSummaries.length > 0
      ? dailyLimit({ balance: todayBalance, committed: committedUpcomingItems, floor: safetyFloor, goalReserve: activeGoalsCost, heldReserve, cardReserve, daysLeft }).rate
      : safeToSpendPerDay,
    safeVelocity: (() => {
      // With accounts, the limit and pace come from unified figures, so an account
      // in deficit lowers the total instead of vanishing at 0.
      const { freeSurplus: free, rate } = accountSummaries.length > 0
        ? dailyLimit({ balance: todayBalance, committed: committedUpcomingItems, floor: safetyFloor, goalReserve: activeGoalsCost, heldReserve, cardReserve, daysLeft })
        : { freeSurplus, rate: safeVelocityPerDay };
      const pace = accountSummaries.length > 0 ? classifyPace(rate, burnRatePerDay) : paceStatus;
      return {
        safeVelocityPerDay: rate,
        rate,
        freeSurplus: free,
        burnRatePerDay,
        burnRate: burnRatePerDay,
        committedUpcomingItems,
        committedBills: committedUpcomingItems,
        activeGoalsCost,
        goalReserve: activeGoalsCost,
        heldReserve,
        cardReserve,
        daysLeft,
        daysElapsed,
        paceStatus: pace,
        status: pace
      };
    })(),
    // Credit cards (ADR 0070)
    cardReserve,
    cardLiability: cardReserve,
    cards: cardSummaries,
    cardPayability,
    // Held & Lent money (pass-through): never income or expense
    heldReserve,
    heldForOthers: heldReserve,
    lentOutstanding: lentToday,
    heldByDay,
    passThrough: (() => {
      const sums = { heldIn: 0, heldReturned: 0, lentOut: 0, lentRepaid: 0 };
      events.forEach((e) => {
        if (e.itemType !== 'pass-through' || !(e.isActual || e.isPaid)) return;
        const amt = Math.abs(e.amount);
        if (e.passThroughKind === 'held_in') sums.heldIn += amt;
        else if (e.passThroughKind === 'held_return') sums.heldReturned += amt;
        else if (e.passThroughKind === 'lent_out') sums.lentOut += amt;
        else if (e.passThroughKind === 'lent_repaid') sums.lentRepaid += amt;
      });
      return {
        ...sums,
        heldOpening: heldOpeningBalance,
        lentOpening: lentOpeningBalance,
        heldEnding,
        lentEnding
      };
    })(),
    accounts: accountsMap,
    accountSummaries,
    accountDailyBalances,
    accountSimulations
  };
}
