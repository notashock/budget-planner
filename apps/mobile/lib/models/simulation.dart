// Simulation result models.
//
// The app no longer computes simulations itself: it shows the server's result
// (computed by @budget/engine), so web and mobile always show the same numbers.
// These classes only parse that JSON.

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
    final desc =
        json['description']?.toString() ?? note ?? json['memo']?.toString();
    final rawName = json['name']?.toString() ?? label ?? desc ?? 'Event';
    final rawCat = json['category']?.toString() ?? json['tag']?.toString();
    final rawStatus = json['status']?.toString();
    final bool isSuccessful =
        rawStatus == 'successful' || json['isPaid'] == true;

    return TimelineEvent(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      date: json['date']?.toString() ?? '',
      day: (num.tryParse('${json['day']}') ?? 1).toInt(),
      type:
          json['type']?.toString() ??
          (json['itemType']?.toString() ?? 'transaction'),
      name: rawName,
      description: desc ?? label ?? rawName,
      amount: (num.tryParse('${json['amount']}') ?? 0).round(),
      runningBalance:
          (num.tryParse('${json['balanceAfter'] ?? json['runningBalance']}') ??
                  0)
              .round(),
      accountId:
          json['accountId']?.toString() ??
          (json['bankAccountId']?.toString() ?? json['walletId']?.toString()),
      accountType: json['accountType']?.toString(),
      category:
          (rawCat != null &&
              rawCat.trim().isNotEmpty &&
              rawCat.trim().toLowerCase() != 'other')
          ? rawCat.trim()
          : (rawCat?.trim() ?? 'General'),
      isPaid: isSuccessful,
      status: rawStatus ?? (isSuccessful ? 'successful' : 'planned'),
      origin:
          json['origin']?.toString() ??
          (json['type'] == 'item' ? 'planned' : 'spot'),
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
      events: rawEvents
          .map(
            (e) => TimelineEvent.fromJson(Map<String, dynamic>.from(e as Map)),
          )
          .toList(),
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
    final daily =
        json['safeVelocityPerDay'] ??
        json['safeDailyAmount'] ??
        json['rate'] ??
        0;
    final days = json['daysLeft'] ?? json['remainingDays'] ?? 1;
    final budget = json['freeSurplus'] ?? json['availableBudget'] ?? 0;
    final stat = json['paceStatus'] ?? json['status'] ?? 'healthy';
    final committed =
        json['committedUpcomingItems'] ?? json['committedBills'] ?? 0;
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

  /// Money held for other people today: in the balance, but kept out of Safe-to-Spend
  final int heldReserve;

  /// Money other people owe you today
  final int lentOutstanding;

  /// Owed on credit cards today: set aside from Safe-to-Spend from the swipe day
  final int cardReserve;

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
    this.heldReserve = 0,
    this.lentOutstanding = 0,
    this.cardReserve = 0,
  });

  factory SimulationResult.fromJson(Map<String, dynamic> json) {
    final rawEvents = json['allEvents'] is List
        ? json['allEvents'] as List
        : (json['events'] is List ? json['events'] as List : []);
    final rawBreaches = json['breaches'] is List
        ? json['breaches'] as List
        : [];

    final rawVelocity = json['safeVelocity'] is Map
        ? Map<String, dynamic>.from(json['safeVelocity'] as Map)
        : <String, dynamic>{};

    final rawAccts = json['accountBalances'] is Map
        ? json['accountBalances'] as Map
        : {};
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
      closingBalance:
          (num.tryParse('${json['closingBalance'] ?? json['endingBalance']}') ??
                  0)
              .round(),
      lowestBalance: (num.tryParse('${json['lowestBalance']}') ?? 0).round(),
      lowestBalanceDay: (num.tryParse('${json['lowestBalanceDay']}') ?? 1)
          .toInt(),
      totalIncome:
          (num.tryParse('${json['totalIncome'] ?? json['incomeAmount']}') ?? 0)
              .round(),
      totalPlannedExpenses:
          (num.tryParse(
                    '${json['totalPlannedExpenses'] ?? json['totalExpenses']}',
                  ) ??
                  0)
              .round(),
      totalActualExpenses: (num.tryParse('${json['totalActualExpenses']}') ?? 0)
          .round(),
      todaysBalance:
          (num.tryParse('${json['todaysBalance'] ?? json['todayBalance']}') ??
                  0)
              .round(),
      days: parsedDays,
      allEvents: rawEvents
          .map(
            (e) => TimelineEvent.fromJson(Map<String, dynamic>.from(e as Map)),
          )
          .toList(),
      breaches: rawBreaches
          .map((b) => FloorBreach.fromJson(Map<String, dynamic>.from(b as Map)))
          .toList(),
      safeVelocity: SafeVelocity.fromJson(rawVelocity),
      accountBalances: parsedAccts,
      heldReserve: (num.tryParse('${json['heldReserve'] ?? 0}') ?? 0).round(),
      lentOutstanding: (num.tryParse('${json['lentOutstanding'] ?? 0}') ?? 0)
          .round(),
      cardReserve: (num.tryParse('${json['cardReserve'] ?? 0}') ?? 0).round(),
    );
  }
}
