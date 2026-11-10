import {
  getDaysInMonth,
  clampDayToMonth,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
} from './calendar.js';

/**
 * Computes derived transaction status based on scheduled date vs today's date.
 * Never stored; computed dynamically.
 * 
 * @param {object} tx - Transaction record
 * @param {string} todayStr - Local calendar date 'YYYY-MM-DD'
 * @param {number} [dueWindowDays=3] - Days window within which a planned transaction is 'due'
 * @returns {'planned' | 'due' | 'overdue' | 'successful' | 'cancelled'}
 */
export function deriveTransactionState(tx, todayStr, dueWindowDays = 3) {
  if (!tx) return 'planned';
  const status = tx.status || 'planned';
  if (status !== 'planned') {
    return status;
  }
  const txDate = tx.plannedDate || tx.date;
  if (!txDate || !todayStr) {
    return 'planned';
  }
  if (txDate < todayStr) {
    return 'overdue';
  }
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const [pY, pM, pD] = txDate.split('-').map(Number);
  const todayUtc = Date.UTC(tY, tM - 1, tD);
  const targetUtc = Date.UTC(pY, pM - 1, pD);
  const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays >= 0 && diffDays <= dueWindowDays) {
    return 'due';
  }
  return 'planned';
}

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
      if (!it.isIncome && it.origin !== 'salary') {
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
    const isKnownBank = rawBankId && normalizedAccounts.some((a) => a.id === rawBankId || a.altId === rawBankId);
    const isKnownWall = rawWallId && normalizedAccounts.some((a) => a.id === rawWallId || a.altId === rawWallId);
    const bankId = isKnownBank ? rawBankId : (!isKnownWall ? (primaryBankId || designatedSalaryBankId) : null);
    const wallId = isKnownWall ? rawWallId : null;
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

      const isIncomePlanned = Boolean(item.isIncome || item.origin === 'salary');
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
        itemType: isPlannedTx ? 'planned-transaction' : 'one-time',
        isPlannedTransaction: isPlannedTx,
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
    if (salaryTx && (tx === salaryTx || (tx._id && String(tx._id) === String(salaryTx._id)) || (tx.id && String(tx.id) === String(salaryTx.id)))) {
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

    const txAmount = Math.round(Number(tx.amount) || 0);
    const isIncomeTx = Boolean(tx.isIncome);
    let eventAmount = 0;
    let itemType = 'unplanned-transaction';

    if (isIncomeTx) {
      eventAmount = Math.abs(txAmount);
      itemType = 'actual-income';
    } else {
      eventAmount = txAmount > 0 ? -txAmount : Math.abs(txAmount);
      if (!tx.plannedItemId) {
        totalUnplannedSpent += txAmount;
      }
      itemType = tx.plannedItemId
        ? (txAmount < 0 ? 'actual-refund' : 'actual-matched')
        : 'unplanned-transaction';
    }

    const labelPrefix = txAmount < 0 ? 'Refund: ' : (isIncomeTx ? 'Income: ' : '');
    const eventLabel = tx.note
      ? `${labelPrefix}${tx.note} (${tx.tag || (isIncomeTx ? 'Income' : 'Expense')})`
      : `${labelPrefix}${tx.tag || (txAmount < 0 ? 'Refund' : (isIncomeTx ? 'Income' : 'Unplanned expense'))}`;

    const rawTxBankId = normalizeId(tx.bankAccountId || tx.accountId);
    const rawTxWallId = normalizeId(tx.walletId);
    const isKnownTxBank = rawTxBankId && normalizedAccounts.some((a) => a.id === rawTxBankId || a.altId === rawTxBankId);
    const isKnownTxWall = rawTxWallId && normalizedAccounts.some((a) => a.id === rawTxWallId || a.altId === rawTxWallId);
    const bankId = isKnownTxBank ? rawTxBankId : (!isKnownTxWall ? (primaryBankId || designatedSalaryBankId) : null);
    const wallId = isKnownTxWall ? rawTxWallId : null;
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
      accountType: acctType,
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
      sourceType: tr.sourceType,
      sourceBankAccountId: sBankId,
      sourceWalletId: sWalletId,
      destinationType: tr.destinationType,
      destinationBankAccountId: dBankId,
      destinationWalletId: dWalletId
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

  const events = rawEvents.map((evt) => {
    currentBalance += evt.amount;
    const balanceAfter = currentBalance;

    if (balanceAfter < lowestBalance) {
      lowestBalance = balanceAfter;
      lowestDate = evt.date;
    }

    let accountBalanceAfter = null;
    let sourceAccountBalanceAfter = null;
    let destinationAccountBalanceAfter = null;

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
      } else {
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
      } else {
        unassignedRunningBalance += trAmt;
        destinationAccountBalanceAfter = unassignedRunningBalance;
      }
    } else {
      const bId = getCanonicalAccId(evt.bankAccountId);
      const wId = getCanonicalAccId(evt.walletId);
      const defaultBankTarget = getCanonicalAccId(primaryBankId || designatedSalaryBankId);

      const targetBankId = (bId && accountRunningBalances[bId] !== undefined)
        ? bId
        : ((!wId || accountRunningBalances[wId] === undefined) ? defaultBankTarget : null);

      if (targetBankId && accountRunningBalances[targetBankId] !== undefined) {
        accountRunningBalances[targetBankId] += evt.amount;
        accountBalanceAfter = accountRunningBalances[targetBankId];
      } else if (wId && accountRunningBalances[wId] !== undefined) {
        accountRunningBalances[wId] += evt.amount;
        accountBalanceAfter = accountRunningBalances[wId];
      } else {
        unassignedRunningBalance += evt.amount;
        accountBalanceAfter = unassignedRunningBalance;
      }
    }

    // Update lowest balances and dates per account
    normalizedAccounts.forEach((acc) => {
      const accId = acc.id;
      if (accountRunningBalances[accId] < accountLowestBalances[accId]) {
        accountLowestBalances[accId] = accountRunningBalances[accId];
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
      accountBalanceAfter,
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
      accountBalances: { ...accountRunningBalances }
    };
  });

  const endingBalance = currentBalance;

  if (events.length === 0) {
    lowestBalance = endingBalance;
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

  let eventIdx = 0;
  for (let d = minNegativeDay; d <= daysInMonth; d++) {
    if (d === 0) continue; // Calendar skips Day 0 between Day -1 and Day 1

    const dateStr = getDateFromRelativeDay(d, year, monthNum);
    const dayEventsList = [];
    while (eventIdx < events.length && events[eventIdx].day === d) {
      const e = events[eventIdx];
      dayBalance = e.balanceAfter;
      dayEventsList.push(e);

      if (e.itemType === 'transfer') {
        const trAmt = e.transferAmount;
        const sBank = getCanonicalAccId(e.sourceBankAccountId);
        const sWall = getCanonicalAccId(e.sourceWalletId);
        const dBank = getCanonicalAccId(e.destinationBankAccountId);
        const dWall = getCanonicalAccId(e.destinationWalletId);

        if (sBank && currentDayAccBalances[sBank] !== undefined) {
          currentDayAccBalances[sBank] -= trAmt;
        } else if (sWall && currentDayAccBalances[sWall] !== undefined) {
          currentDayAccBalances[sWall] -= trAmt;
        } else {
          currentUnassignedDayBalance -= trAmt;
        }

        if (dBank && currentDayAccBalances[dBank] !== undefined) {
          currentDayAccBalances[dBank] += trAmt;
        } else if (dWall && currentDayAccBalances[dWall] !== undefined) {
          currentDayAccBalances[dWall] += trAmt;
        } else {
          currentUnassignedDayBalance += trAmt;
        }
      } else {
        const bId = getCanonicalAccId(e.bankAccountId);
        const wId = getCanonicalAccId(e.walletId);
        const defaultBankTarget = getCanonicalAccId(primaryBankId || designatedSalaryBankId);

        const targetBankId = (bId && currentDayAccBalances[bId] !== undefined)
          ? bId
          : ((!wId || currentDayAccBalances[wId] === undefined) ? defaultBankTarget : null);

        if (targetBankId && currentDayAccBalances[targetBankId] !== undefined) {
          currentDayAccBalances[targetBankId] += e.amount;
        } else if (wId && currentDayAccBalances[wId] !== undefined) {
          currentDayAccBalances[wId] += e.amount;
        } else {
          currentUnassignedDayBalance += e.amount;
        }
      }

      eventIdx++;
    }

    dailyBalances.push({
      day: d,
      date: dateStr,
      balance: dayBalance,
      intradayEvents: dayEventsList
    });

    normalizedAccounts.forEach((acc) => {
      accountDailyBalances[acc.id].push({
        day: d,
        date: dateStr,
        balance: currentDayAccBalances[acc.id]
      });
    });

    accountDailyBalances['unassigned'].push({
      day: d,
      date: dateStr,
      balance: currentUnassignedDayBalance
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
    if (evt.day > effectiveDay && !evt.isActual && evt.amount < 0) {
      committedUpcomingItems += Math.abs(evt.amount);
    }
  });

  let activeGoalsCost = 0;
  (goals || []).forEach((g) => {
    if (g && (g.status === 'active' || g.status === 'evaluating')) {
      activeGoalsCost += Math.round(Number(g.targetAmount) || 0);
    }
  });

  const freeSurplus = Math.max(0, todayBalance - committedUpcomingItems - safetyFloor - activeGoalsCost);
  const safeVelocityPerDay = Math.max(0, Math.floor(freeSurplus / daysLeft));

  let totalAllSpentToDate = 0;
  (transactions || []).forEach((tx) => {
    if (salaryTx && (tx === salaryTx || (tx._id && String(tx._id) === String(salaryTx._id)) || (tx.id && String(tx.id) === String(salaryTx.id)))) {
      return;
    }
    if (tx.origin === 'transfer' || tx.category === 'Transfer' || tx.destinationAccountId || tx.itemType === 'transfer' || tx.isTransfer) {
      return;
    }
    if (!tx.isIncome) {
      const txAmt = Math.round(Number(tx.amount) || 0);
      const txDay = getRelativeDay(tx.date, year, monthNum);
      if (txDay <= effectiveDay) {
        totalAllSpentToDate += txAmt;
      }
    }
  });

  const burnRatePerDay = totalAllSpentToDate > 0 ? Math.round(totalAllSpentToDate / daysElapsed) : 0;

  let paceStatus = 'stable';
  if (safeVelocityPerDay <= 0) {
    paceStatus = 'critical';
  } else if (burnRatePerDay > safeVelocityPerDay * 1.25) {
    paceStatus = 'contracting';
  } else if (burnRatePerDay < safeVelocityPerDay * 0.75) {
    paceStatus = 'expanding';
  }

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

      if (evt.amount > 0 && isDst) {
        accIncome += evt.amount;
      }
      if (evt.amount < 0 && isSrc) {
        accExpenses += Math.abs(evt.amount);
        // Consider all upcoming planned expenses as committed bills; strictly future events (day > effectiveDay)
        if (evt.day > effectiveDay && !evt.isActual) {
          accCommitted += Math.abs(evt.amount);
        }
      }
    });

    let accSpentToDate = 0;
    (transactions || []).forEach((tx) => {
      // Exclude main salary transaction from expense burn pace
      if (salaryTx && (tx === salaryTx || (tx._id && String(tx._id) === String(salaryTx._id)) || (tx.id && String(tx.id) === String(salaryTx.id)))) {
        return;
      }
      // Exclude formal transfers from burn pace
      if (tx.itemType === 'transfer' || tx.isTransfer || tx.origin === 'transfer' || tx.category === 'Transfer' || tx.destinationAccountId) {
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

    let accGoals = 0;
    (goals || []).forEach((g) => {
      const isGoalAcct = String(g.fundingBankAccountId?._id || g.fundingBankAccountId) === accId ||
                        String(g.fundingWalletId?._id || g.fundingWalletId) === accId;
      if (isGoalAcct && (g.status === 'active' || g.status === 'evaluating')) {
        accGoals += Math.round(Number(g.targetAmount) || 0);
      }
    });

    const accFreeSurplus = Math.max(0, accToday - accCommitted - minBal - accGoals);
    const accSafeVelocity = Math.max(0, Math.floor(accFreeSurplus / daysLeft));
    const accBurnRate = accSpentToDate > 0 ? Math.round(accSpentToDate / daysElapsed) : 0;

    let accPaceStatus = 'stable';
    if (accSafeVelocity <= 0) {
      accPaceStatus = 'critical';
    } else if (accBurnRate > accSafeVelocity * 1.25) {
      accPaceStatus = 'contracting';
    } else if (accBurnRate < accSafeVelocity * 0.75) {
      accPaceStatus = 'expanding';
    }

    const allPts = accountDailyBalances[accId] || [];
    const pastPts = typeof currentDay === 'number' && currentDay >= 1
      ? allPts.filter((pt) => pt.day < currentDay)
      : [];
    const futurePts = typeof currentDay === 'number' && currentDay >= 1
      ? allPts.filter((pt) => pt.day >= currentDay)
      : allPts;

    const pastTouchedZero = pastPts.some((pt) => pt.balance <= 0);
    const eligiblePts = (pastTouchedZero && futurePts.length > 0)
      ? futurePts
      : (allPts.length > 0 ? allPts : [{ date: formatDate(year, monthNum, 1), balance: accountInitialBalances[accId] || 0 }]);

    const lowestPt = eligiblePts.reduce(
      (min, pt) => (pt.balance < min.balance ? pt : min),
      eligiblePts[0]
    );

    const lowestBal = lowestPt.balance;
    const lowestDt = lowestPt.date || formatDate(year, monthNum, 1);

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
      minimumBalance: minBal,
      floorBreached,
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
        daysLeft,
        daysElapsed
      }
    };
  });

  const accountsMap = {};
  const accountSimulations = {};
  accountSummaries.forEach((s) => {
    accountsMap[s.id] = s;
    if (s.altId) {
      accountsMap[s.altId] = s;
    }

    const accSim = {
      todayBalance: s.todayBalance,
      todaysBalance: s.todayBalance,
      endingBalance: s.endingBalance,
      lowestBalance: s.lowestBalance,
      lowestDate: s.lowestDate,
      floorBreached: s.floorBreached,
      dailyBalances: accountDailyBalances[s.id] || [],
      openingBalance: s.openingBalance,
      minimumBalance: s.minimumBalance,
      safetyFloor: s.minimumBalance,
      incomeAmount: s.incomeAmount,
      totalExpenses: s.totalExpenses,
      safeVelocity: s.safeVelocity
    };
    accountSimulations[s.id] = accSim;
    if (s.altId) {
      accountSimulations[s.altId] = accSim;
    }
  });

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
    .filter((e) => e.amount < 0 && e.itemType !== 'transfer')
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const aggLowestBalance = (dailyBalances && dailyBalances.length > 0)
    ? Math.min(...dailyBalances.map((d) => (d.balance !== undefined ? d.balance : (d.closingBalance !== undefined ? d.closingBalance : lowestBalance))))
    : lowestBalance;

  const aggFloorBreached = accountSummaries.length > 0
    ? (aggLowestBalance < safetyFloor)
    : floorBreached;

  // 12. Build rich normalized days array for graph & interactive timeline parity
  let prevBal = effectiveOpeningBalance;
  const days = dailyBalances.map((pt) => {
    const dayEvts = events.filter((e) => e.day === pt.day);
    let dayInflow = 0;
    let dayOutflow = 0;
    dayEvts.forEach((e) => {
      if (e.amount > 0) dayInflow += e.amount;
      if (e.amount < 0) dayOutflow += Math.abs(e.amount);
    });
    const dayObj = {
      day: pt.day,
      date: pt.date,
      balance: pt.balance,
      openingBalance: prevBal,
      closingBalance: pt.balance,
      totalInflow: dayInflow,
      totalOutflow: dayOutflow,
      events: dayEvts,
      hasBreach: pt.balance < safetyFloor
    };
    prevBal = pt.balance;
    return dayObj;
  });

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
    lowestDate,
    lowestBalanceDay: (() => {
      const match = days.find((d) => d.date === lowestDate || d.closingBalance === aggLowestBalance);
      return match ? match.day : 1;
    })(),
    safetyFloor,
    floorBreached: aggFloorBreached,
    totalIncome: totalSimIncome,
    incomeAmount: totalSimIncome,
    totalPlannedExpenses: totalSimExpenses,
    totalActualExpenses: 0,
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
    safeToSpendPerDay: (() => {
      if (accountSummaries.length > 0) {
        return accountSummaries.reduce((sum, a) => sum + (a.safeVelocity?.safeVelocityPerDay || 0), 0);
      }
      return safeToSpendPerDay;
    })(),
    safeVelocity: (() => {
      if (accountSummaries.length > 0) {
        const aggSafeVelocity = accountSummaries.reduce((sum, a) => sum + (a.safeVelocity?.safeVelocityPerDay || 0), 0);
        const aggBurnRate = accountSummaries.reduce((sum, a) => sum + (a.safeVelocity?.burnRatePerDay || 0), 0);
        const aggCommitted = accountSummaries.reduce((sum, a) => sum + (a.safeVelocity?.committedUpcomingItems || 0), 0);
        const aggFreeSurplus = accountSummaries.reduce((sum, a) => sum + (a.safeVelocity?.freeSurplus || 0), 0);

        let aggPaceStatus = 'stable';
        if (aggSafeVelocity <= 0) {
          aggPaceStatus = 'critical';
        } else if (aggBurnRate > aggSafeVelocity * 1.25) {
          aggPaceStatus = 'contracting';
        } else if (aggBurnRate < aggSafeVelocity * 0.75) {
          aggPaceStatus = 'expanding';
        }

        return {
          safeVelocityPerDay: aggSafeVelocity,
          rate: aggSafeVelocity,
          freeSurplus: aggFreeSurplus,
          burnRatePerDay: aggBurnRate,
          burnRate: aggBurnRate,
          committedUpcomingItems: aggCommitted,
          committedBills: aggCommitted,
          activeGoalsCost,
          daysLeft,
          daysElapsed,
          paceStatus: aggPaceStatus,
          status: aggPaceStatus
        };
      }

      return {
        safeVelocityPerDay,
        rate: safeVelocityPerDay,
        freeSurplus,
        burnRatePerDay,
        burnRate: burnRatePerDay,
        committedUpcomingItems,
        committedBills: committedUpcomingItems,
        activeGoalsCost,
        daysLeft,
        daysElapsed,
        paceStatus,
        status: paceStatus
      };
    })(),
    accounts: accountsMap,
    accountSummaries,
    accountDailyBalances,
    accountSimulations
  };
}
