import 'calendar.dart';

/// Models for Simulation outputs

class TimelineEvent {
  final String id;
  final String date;
  final int day;
  final String type; // 'income' | 'item' | 'transaction' | 'transfer'
  final String name;
  final String? description;
  final int amount; // positive for credit, negative for debit
  final int runningBalance;
  final String? accountId;
  final String? accountType;
  final String? category;
  final bool isPaid;
  final String status; // 'successful' | 'planned' | 'cancelled'
  final String? origin; // 'spot' | 'planned' | 'goal'
  final String? derivedStatus; // 'due' | 'overdue' | 'planned'
  final Map<String, dynamic> raw;

  TimelineEvent({
    required this.id,
    required this.date,
    required this.day,
    required this.type,
    required this.name,
    this.description,
    required this.amount,
    required this.runningBalance,
    this.accountId,
    this.accountType,
    this.category,
    this.isPaid = false,
    this.status = 'successful',
    this.origin,
    this.derivedStatus,
    this.raw = const {},
  });

  factory TimelineEvent.fromJson(Map<String, dynamic> json) {
    final label = json['label']?.toString();
    final note = json['note']?.toString();
    final desc = json['description']?.toString() ?? note ?? json['memo']?.toString();
    final rawName = json['name']?.toString() ?? label ?? desc ?? 'Event';
    final rawCat = json['category']?.toString() ?? json['tag']?.toString();
    final rawStatus = json['status']?.toString();
    final bool isSuccessful = rawStatus == 'successful' || json['isPaid'] == true;

    return TimelineEvent(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      date: json['date']?.toString() ?? '',
      day: (num.tryParse('${json['day']}') ?? 1).toInt(),
      type: json['type']?.toString() ?? (json['itemType']?.toString() ?? 'transaction'),
      name: rawName,
      description: desc ?? label ?? rawName,
      amount: (num.tryParse('${json['amount']}') ?? 0).round(),
      runningBalance: (num.tryParse('${json['balanceAfter'] ?? json['runningBalance']}') ?? 0).round(),
      accountId: json['accountId']?.toString() ?? (json['bankAccountId']?.toString() ?? json['walletId']?.toString()),
      accountType: json['accountType']?.toString(),
      category: (rawCat != null && rawCat.trim().isNotEmpty && rawCat.trim().toLowerCase() != 'other') ? rawCat.trim() : (rawCat?.trim() ?? 'General'),
      isPaid: isSuccessful,
      status: rawStatus ?? (isSuccessful ? 'successful' : 'planned'),
      origin: json['origin']?.toString() ?? (json['type'] == 'item' ? 'planned' : 'spot'),
      derivedStatus: json['derivedStatus']?.toString(),
      raw: json,
    );
  }
}

class TimelineDay {
  final int day;
  final String date;
  final int openingBalance;
  final int closingBalance;
  final int totalInflow;
  final int totalOutflow;
  final List<TimelineEvent> events;
  final bool hasBreach;

  TimelineDay({
    required this.day,
    required this.date,
    required this.openingBalance,
    required this.closingBalance,
    required this.totalInflow,
    required this.totalOutflow,
    required this.events,
    required this.hasBreach,
  });

  factory TimelineDay.fromJson(Map<String, dynamic> json) {
    final rawEvents = json['events'] is List ? json['events'] as List : [];
    return TimelineDay(
      day: (num.tryParse('${json['day']}') ?? 1).toInt(),
      date: json['date']?.toString() ?? '',
      openingBalance: (num.tryParse('${json['openingBalance']}') ?? 0).round(),
      closingBalance: (num.tryParse('${json['closingBalance']}') ?? 0).round(),
      totalInflow: (num.tryParse('${json['totalInflow']}') ?? 0).round(),
      totalOutflow: (num.tryParse('${json['totalOutflow']}') ?? 0).round(),
      events: rawEvents.map((e) => TimelineEvent.fromJson(Map<String, dynamic>.from(e as Map))).toList(),
      hasBreach: json['hasBreach'] == true,
    );
  }
}

class FloorBreach {
  final int day;
  final String date;
  final int balance;
  final int safetyFloor;
  final int deficit;

  FloorBreach({
    required this.day,
    required this.date,
    required this.balance,
    required this.safetyFloor,
    required this.deficit,
  });

  factory FloorBreach.fromJson(Map<String, dynamic> json) {
    return FloorBreach(
      day: (num.tryParse('${json['day']}') ?? 1).toInt(),
      date: json['date']?.toString() ?? '',
      balance: (num.tryParse('${json['balance']}') ?? 0).round(),
      safetyFloor: (num.tryParse('${json['safetyFloor']}') ?? 0).round(),
      deficit: (num.tryParse('${json['deficit']}') ?? 0).round(),
    );
  }
}

class SafeVelocity {
  final int safeDailyAmount; // in minor units
  final int remainingDays;
  final int availableBudget;
  final String status; // 'healthy' | 'tight' | 'breached'
  final int committedUpcomingItems;
  final int burnRatePerDay;

  SafeVelocity({
    required this.safeDailyAmount,
    required this.remainingDays,
    required this.availableBudget,
    required this.status,
    this.committedUpcomingItems = 0,
    this.burnRatePerDay = 0,
  });

  factory SafeVelocity.fromJson(Map<String, dynamic> json) {
    final daily = json['safeVelocityPerDay'] ?? json['safeDailyAmount'] ?? json['rate'] ?? 0;
    final days = json['daysLeft'] ?? json['remainingDays'] ?? 1;
    final budget = json['freeSurplus'] ?? json['availableBudget'] ?? 0;
    final stat = json['paceStatus'] ?? json['status'] ?? 'healthy';
    final committed = json['committedUpcomingItems'] ?? json['committedBills'] ?? 0;
    final burn = json['burnRatePerDay'] ?? json['burnRate'] ?? 0;

    return SafeVelocity(
      safeDailyAmount: (num.tryParse('$daily') ?? 0).round(),
      remainingDays: (num.tryParse('$days') ?? 1).toInt(),
      availableBudget: (num.tryParse('$budget') ?? 0).round(),
      status: stat.toString(),
      committedUpcomingItems: (num.tryParse('$committed') ?? 0).round(),
      burnRatePerDay: (num.tryParse('$burn') ?? 0).round(),
    );
  }
}

class SimulationResult {
  final int openingBalance;
  final int closingBalance;
  final int lowestBalance;
  final int lowestBalanceDay;
  final int totalIncome;
  final int totalPlannedExpenses;
  final int totalActualExpenses;
  final int todaysBalance;
  final List<TimelineDay> days;
  final List<TimelineEvent> allEvents;
  final List<FloorBreach> breaches;
  final SafeVelocity safeVelocity;
  final Map<String, int> accountBalances;

  SimulationResult({
    required this.openingBalance,
    required this.closingBalance,
    required this.lowestBalance,
    required this.lowestBalanceDay,
    required this.totalIncome,
    required this.totalPlannedExpenses,
    required this.totalActualExpenses,
    required this.todaysBalance,
    required this.days,
    required this.allEvents,
    required this.breaches,
    required this.safeVelocity,
    required this.accountBalances,
  });

  factory SimulationResult.fromJson(Map<String, dynamic> json) {
    final rawEvents = json['allEvents'] is List
        ? json['allEvents'] as List
        : (json['events'] is List ? json['events'] as List : []);
    final rawBreaches = json['breaches'] is List ? json['breaches'] as List : [];

    final rawVelocity = json['safeVelocity'] is Map
        ? Map<String, dynamic>.from(json['safeVelocity'] as Map)
        : <String, dynamic>{};

    final rawAccts = json['accountBalances'] is Map ? json['accountBalances'] as Map : {};
    final parsedAccts = <String, int>{};
    rawAccts.forEach((k, v) {
      parsedAccts[k.toString()] = (num.tryParse('$v') ?? 0).round();
    });

    List<dynamic> rawDayList = json['days'] is List ? json['days'] as List : [];
    if (rawDayList.isEmpty && json['dailyBalances'] is List) {
      rawDayList = json['dailyBalances'] as List;
    }

    final parsedDays = rawDayList.map((d) {
      final map = Map<String, dynamic>.from(d as Map);
      if (!map.containsKey('closingBalance') && map.containsKey('balance')) {
        map['closingBalance'] = map['balance'];
      }
      return TimelineDay.fromJson(map);
    }).toList();

    return SimulationResult(
      openingBalance: (num.tryParse('${json['openingBalance']}') ?? 0).round(),
      closingBalance: (num.tryParse('${json['closingBalance'] ?? json['endingBalance']}') ?? 0).round(),
      lowestBalance: (num.tryParse('${json['lowestBalance']}') ?? 0).round(),
      lowestBalanceDay: (num.tryParse('${json['lowestBalanceDay']}') ?? 1).toInt(),
      totalIncome: (num.tryParse('${json['totalIncome'] ?? json['incomeAmount']}') ?? 0).round(),
      totalPlannedExpenses: (num.tryParse('${json['totalPlannedExpenses'] ?? json['totalExpenses']}') ?? 0).round(),
      totalActualExpenses: (num.tryParse('${json['totalActualExpenses']}') ?? 0).round(),
      todaysBalance: (num.tryParse('${json['todaysBalance'] ?? json['todayBalance']}') ?? 0).round(),
      days: parsedDays,
      allEvents: rawEvents.map((e) => TimelineEvent.fromJson(Map<String, dynamic>.from(e as Map))).toList(),
      breaches: rawBreaches.map((b) => FloorBreach.fromJson(Map<String, dynamic>.from(b as Map))).toList(),
      safeVelocity: SafeVelocity.fromJson(rawVelocity),
      accountBalances: parsedAccts,
    );
  }
}

/// Pure deterministic budget simulator port from @budget/engine/src/simulator.js
SimulationResult simulate({
  Map<String, dynamic> settings = const {},
  List<dynamic> items = const [],
  Map<String, dynamic> month = const {'year': 2026, 'month': 1},
  List<dynamic> transactions = const [],
  List<dynamic> goals = const [],
  List<dynamic> transfers = const [],
  List<dynamic> accounts = const [],
}) {
  final int year = (num.tryParse('${month['year']}') ?? 2026).toInt();
  final int monthNum = (num.tryParse('${month['month']}') ?? 1).toInt();
  final int daysInMonth = getDaysInMonth(year, monthNum);

  final int openingBalance = (num.tryParse('${settings['openingBalance'] ?? month['openingBalance'] ?? 0}') ?? 0).round();
  final int rawIncome = (num.tryParse('${settings['incomeAmount'] ?? month['incomeAmount'] ?? 0}') ?? 0).round();
  final int defaultIncome = (num.tryParse('${settings['defaultIncomeAmount'] ?? 0}') ?? 0).round();
  final int incomeAmount = rawIncome > 0 ? rawIncome : defaultIncome;
  final int incomeCreditDay = (num.tryParse('${settings['incomeCreditDay'] ?? month['incomeCreditDay'] ?? 1}') ?? 1).toInt().clamp(1, 31);
  final String? salaryBankAccountId = (settings['salaryBankAccountId'] ?? month['salaryBankAccountId'])?.toString();
  final int safetyFloor = (num.tryParse('${settings['safetyFloor'] ?? month['safetyFloor'] ?? 0}') ?? 0).round();

  // Current day resolution
  int currentDay = DateTime.now().toUtc().day;
  final now = DateTime.now().toUtc();
  if (now.year == year && now.month == monthNum) {
    currentDay = now.day;
  } else if (now.year > year || (now.year == year && now.month > monthNum)) {
    currentDay = daysInMonth;
  } else {
    currentDay = 1;
  }
  if (settings['currentDay'] != null) {
    currentDay = (num.tryParse('${settings['currentDay']}') ?? currentDay).toInt();
  }

  // Per-account running balance map
  final Map<String, int> accountBalances = {};
  final String? isolatedAccountId = accounts.length == 1 && accounts.first is Map
      ? (accounts.first['_id'] ?? accounts.first['id'])?.toString()
      : null;
  for (var acc in accounts) {
    if (acc is Map) {
      final id = (acc['_id'] ?? acc['id'])?.toString();
      if (id != null) {
        accountBalances[id] = (num.tryParse('${acc['currentBalance'] ?? acc['openingBalance'] ?? 0}') ?? 0).round();
      }
    }
  }

  // Pre-aggregate events per day
  final Map<int, List<Map<String, dynamic>>> dayEventsMap = {};
  for (int d = 1; d <= daysInMonth; d++) {
    dayEventsMap[d] = [];
  }

  // 1. Income Credit
  if (incomeAmount > 0) {
    dayEventsMap[incomeCreditDay]?.add({
      'id': 'income_event',
      'type': 'income',
      'name': 'Monthly Salary',
      'amount': incomeAmount,
      'accountId': salaryBankAccountId,
      'isPaid': true,
    });
  }

  // 2. Planned Items
  int totalPlannedExpenses = 0;
  for (var itm in items) {
    if (itm is! Map) continue;
    final amt = ((itm['amount'] ?? 0) as num).round();
    if (amt <= 0) continue;

    final isPaid = itm['isPaid'] == true;
    final itemType = itm['type']?.toString() ?? 'one-time';
    int day = 1;

    if (itemType == 'recurring') {
      day = clampDayToMonth(((itm['day'] ?? 1) as num).toInt(), daysInMonth);
    } else {
      if (itm['date'] != null) {
        day = getRelativeDay(itm['date'].toString(), year, monthNum);
      } else {
        day = ((itm['day'] ?? 1) as num).toInt();
      }
      day = day.clamp(1, daysInMonth);
    }

    totalPlannedExpenses += amt;

    // Only deduct planned item if NOT yet settled by an actual transaction
    if (!isPaid) {
      dayEventsMap[day]?.add({
        'id': (itm['_id'] ?? itm['id'] ?? 'item_${dayEventsMap[day]!.length}').toString(),
        'type': 'item',
        'name': itm['name']?.toString() ?? 'Planned Expense',
        'amount': -amt,
        'category': itm['category']?.toString(),
        'accountId': itm['bankAccountId'] ?? itm['walletId'],
        'accountType': itm['accountType']?.toString(),
        'isPaid': false,
        'raw': itm,
      });
    }
  }

  // 3. Transactions (Actuals)
  int totalActualExpenses = 0;
  for (var tx in transactions) {
    if (tx is! Map) continue;
    final amt = ((tx['amount'] ?? 0) as num).round();
    final txType = tx['type']?.toString() ?? 'expense';
    final sign = txType == 'income' || txType == 'refund' ? 1 : -1;
    final netAmt = amt * sign;

    if (sign < 0) {
      totalActualExpenses += amt;
    }

    int day = 1;
    if (tx['date'] != null) {
      day = getRelativeDay(tx['date'].toString(), year, monthNum);
    } else {
      day = ((tx['day'] ?? 1) as num).toInt();
    }
    day = day.clamp(1, daysInMonth);

    dayEventsMap[day]?.add({
      'id': (tx['_id'] ?? tx['id'] ?? 'tx_${dayEventsMap[day]!.length}').toString(),
      'type': 'transaction',
      'name': tx['description']?.toString() ?? (tx['name']?.toString() ?? 'Transaction'),
      'amount': netAmt,
      'category': tx['category']?.toString(),
      'accountId': tx['bankAccountId'] ?? tx['walletId'],
      'accountType': tx['accountType']?.toString(),
      'isPaid': true,
      'raw': tx,
    });
  }

  // 4. Paired Transfers
  for (var tr in transfers) {
    if (tr is! Map) continue;
    final amt = ((tr['amount'] ?? 0) as num).round();
    if (amt <= 0) continue;

    int day = 1;
    if (tr['date'] != null) {
      day = getRelativeDay(tr['date'].toString(), year, monthNum);
    } else {
      day = ((tr['day'] ?? 1) as num).toInt();
    }
    final sId = (tr['sourceAccountId'] ?? tr['sourceBankAccountId'] ?? tr['sourceWalletId'] ?? tr['fromAccountId'])?.toString();
    final dId = (tr['destinationAccountId'] ?? tr['destinationBankAccountId'] ?? tr['destinationWalletId'] ?? tr['toAccountId'])?.toString();

    if (sId != null && accountBalances.containsKey(sId)) {
      accountBalances[sId] = accountBalances[sId]! - amt;
    }
    if (dId != null && accountBalances.containsKey(dId)) {
      accountBalances[dId] = accountBalances[dId]! + amt;
    }

    int eventAmt = 0;
    if (isolatedAccountId != null) {
      if (dId == isolatedAccountId) {
        eventAmt = amt;
      } else if (sId == isolatedAccountId) {
        eventAmt = -amt;
      }
    }

    // Intra-account transfer does not change aggregate total balance, but alters individual accounts
    dayEventsMap[day]?.add({
      'id': (tr['_id'] ?? tr['id'] ?? 'tr_${dayEventsMap[day]!.length}').toString(),
      'type': 'transfer',
      'name': 'Transfer: ${tr['fromAccountName'] ?? 'Source'} → ${tr['toAccountName'] ?? 'Destination'}',
      'amount': eventAmt,
      'fromAccountId': sId,
      'toAccountId': dId,
      'transferAmount': amt,
      'isPaid': true,
      'raw': tr,
    });
  }

  // Run simulation day-by-day
  int running = openingBalance;
  int? lowest;
  int lowestDay = 1;
  int todaysBal = openingBalance;

  final List<TimelineDay> daysList = [];
  final List<TimelineEvent> allEventsList = [];
  final List<FloorBreach> breachesList = [];

  for (int d = 1; d <= daysInMonth; d++) {
    final dayOpening = running;
    final events = dayEventsMap[d] ?? [];
    int dayInflow = 0;
    int dayOutflow = 0;
    final List<TimelineEvent> dayEvents = [];

    for (var ev in events) {
      final amt = (num.tryParse('${ev['amount'] ?? 0}') ?? 0).toInt();
      running += amt;

      if (amt > 0) {
        dayInflow += amt;
      } else if (amt < 0) {
        dayOutflow += amt.abs();
      }

      // Update per-account tracking
      final acctId = ev['accountId']?.toString();
      if (acctId != null && accountBalances.containsKey(acctId)) {
        accountBalances[acctId] = (accountBalances[acctId] ?? 0) + amt;
      }

      // Transfer account adjustments
      if (ev['type'] == 'transfer') {
        final fromId = ev['fromAccountId']?.toString();
        final toId = ev['toAccountId']?.toString();
        final trAmt = (num.tryParse('${ev['transferAmount'] ?? 0}') ?? 0).toInt();
        if (fromId != null && accountBalances.containsKey(fromId)) {
          accountBalances[fromId] = (accountBalances[fromId] ?? 0) - trAmt;
        }
        if (toId != null && accountBalances.containsKey(toId)) {
          accountBalances[toId] = (accountBalances[toId] ?? 0) + trAmt;
        }
      }

      final timelineEvent = TimelineEvent(
        id: ev['id'].toString(),
        date: formatDate(year, monthNum, d),
        day: d,
        type: ev['type'].toString(),
        name: ev['name'].toString(),
        description: ev['description']?.toString() ?? ev['name'].toString(),
        amount: amt,
        runningBalance: running,
        accountId: ev['accountId']?.toString(),
        accountType: ev['accountType']?.toString(),
        category: ev['category']?.toString(),
        isPaid: ev['isPaid'] == true,
        raw: ev['raw'] is Map<String, dynamic> ? ev['raw'] as Map<String, dynamic> : {},
      );

      dayEvents.add(timelineEvent);
      allEventsList.add(timelineEvent);

      if (lowest == null || running < lowest) {
        lowest = running;
        lowestDay = d;
      }
    }

    if (events.isEmpty) {
      if (lowest == null || running < lowest) {
        lowest = running;
        lowestDay = d;
      }
    }

    if (d == currentDay) {
      todaysBal = running;
    }

    final hasBreach = running < safetyFloor;
    if (hasBreach) {
      breachesList.add(FloorBreach(
        day: d,
        date: formatDate(year, monthNum, d),
        balance: running,
        safetyFloor: safetyFloor,
        deficit: safetyFloor - running,
      ));
    }

    daysList.add(TimelineDay(
      day: d,
      date: formatDate(year, monthNum, d),
      openingBalance: dayOpening,
      closingBalance: running,
      totalInflow: dayInflow,
      totalOutflow: dayOutflow,
      events: dayEvents,
      hasBreach: hasBreach,
    ));
  }

  // Safe Velocity computation
  final effectiveLowest = lowest ?? openingBalance;
  final remainingDays = (daysInMonth - currentDay + 1).clamp(1, daysInMonth);
  final diff = effectiveLowest - safetyFloor;
  final availableForRest = diff > 0 ? diff : 0;
  final safeDaily = (availableForRest / remainingDays).floor();

  String velocityStatus = 'healthy';
  if (effectiveLowest < safetyFloor) {
    velocityStatus = 'critical';
  } else if (safeDaily < 20000) { // e.g. < ₹200 / day
    velocityStatus = 'tight';
  }

  // Committed upcoming expenses (planned, day >= currentDay)
  int upcomingCommitted = 0;
  for (final itm in items) {
    if (itm is! Map) continue;
    final isPaid = itm['isPaid'] == true;
    final amt = ((itm['amount'] ?? 0) as num).round();
    if (amt <= 0 || isPaid) continue;

    int day = 1;
    final itemType = itm['type']?.toString() ?? 'one-time';
    if (itemType == 'recurring') {
      day = clampDayToMonth(((itm['day'] ?? 1) as num).toInt(), daysInMonth);
    } else {
      if (itm['date'] != null) {
        day = getRelativeDay(itm['date'].toString(), year, monthNum);
      } else {
        day = ((itm['day'] ?? 1) as num).toInt();
      }
      day = day.clamp(1, daysInMonth);
    }

    if (day >= currentDay) {
      upcomingCommitted += amt;
    }
  }

  final pastDaysCount = currentDay > 1 ? (currentDay - 1) : 1;
  final burnRate = (totalActualExpenses / pastDaysCount).round();

  final safeVelocity = SafeVelocity(
    safeDailyAmount: safeDaily,
    remainingDays: remainingDays,
    availableBudget: availableForRest,
    status: velocityStatus,
    committedUpcomingItems: upcomingCommitted,
    burnRatePerDay: burnRate,
  );

  return SimulationResult(
    openingBalance: openingBalance,
    closingBalance: running,
    lowestBalance: effectiveLowest,
    lowestBalanceDay: lowestDay,
    totalIncome: incomeAmount,
    totalPlannedExpenses: totalPlannedExpenses,
    totalActualExpenses: totalActualExpenses,
    todaysBalance: todaysBal,
    days: daysList,
    allEvents: allEventsList,
    breaches: breachesList,
    safeVelocity: safeVelocity,
    accountBalances: accountBalances,
  );
}
