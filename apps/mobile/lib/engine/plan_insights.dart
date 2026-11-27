// Dart ports of packages/engine/src/planInsights.js, so the Plan page shows the
// same split, headroom and verdict as web. plan_insights_test.dart checks them.
import '../models/simulation.dart';

class AllocationSegment {
  const AllocationSegment(this.key, this.amount);
  final String key; // committed | held | cards | floor | goals | free | shortfall
  final int amount;
}

class CashAllocation {
  const CashAllocation(this.total, this.segments);
  final int total;
  final List<AllocationSegment> segments;
}

/// Where today's balance is already promised: bills, held, cards, floor,
/// goals, then free, plus a shortfall when the obligations exceed the balance.
CashAllocation buildCashAllocation({
  required int todayBalance,
  int committedUpcomingItems = 0,
  int safetyFloor = 0,
  int goalReserve = 0,
  int heldReserve = 0,
  int cardReserve = 0,
  int? freeSurplus,
}) {
  int pos(int v) => v < 0 ? 0 : v;
  final balance = pos(todayBalance);
  final committedNeed = pos(committedUpcomingItems), heldNeed = pos(heldReserve), cardNeed = pos(cardReserve);
  final floorNeed = pos(safetyFloor), goalNeed = pos(goalReserve);

  var left = balance;
  int take(int need) {
    final t = need < left ? need : left;
    left -= t;
    return t;
  }

  final committed = take(committedNeed), held = take(heldNeed), cards = take(cardNeed);
  final floor = take(floorNeed), goals = take(goalNeed);
  final free = freeSurplus == null ? left : (pos(freeSurplus) < left ? pos(freeSurplus) : left);
  // Goals are a target, not an obligation, so they never create a shortfall.
  final shortfall = pos(committedNeed + heldNeed + cardNeed + floorNeed - balance);

  final segments = [
    AllocationSegment('committed', committed),
    AllocationSegment('held', held),
    AllocationSegment('cards', cards),
    AllocationSegment('floor', floor),
    AllocationSegment('goals', goals),
    AllocationSegment('free', free),
    AllocationSegment('shortfall', shortfall),
  ].where((s) => s.amount > 0).toList();
  return CashAllocation(balance + shortfall, segments);
}

class Headroom {
  const Headroom(this.amount, this.ratio, this.status);
  final int amount;
  final double ratio;
  final String status; // breached | warning | healthy
}

Headroom getHeadroom(int balance, int minimum) {
  final min = minimum < 0 ? 0 : minimum;
  final amount = balance - min;
  var status = 'healthy';
  if (amount < 0) {
    status = 'breached';
  } else if (min > 0 && balance <= min * 1.15) {
    status = 'warning';
  }
  return Headroom(amount, balance > 0 ? (amount / balance).clamp(0.0, 1.0) : 0.0, status);
}

class MonthVerdict {
  const MonthVerdict(this.key, this.label);
  final String key; // critical | tight | good
  final String label;
}

MonthVerdict getMonthVerdict({required int lowestBalance, required int safetyFloor, String paceStatus = '', int safeRate = 0}) {
  final status = getHeadroom(lowestBalance, safetyFloor).status;
  final pace = paceStatus.toLowerCase();
  if (status == 'breached') return const MonthVerdict('critical', 'Below floor');
  if (status == 'warning' || pace.contains('contract') || pace.contains('crit') || safeRate <= 0) {
    return const MonthVerdict('tight', 'Tight month');
  }
  return const MonthVerdict('good', 'On track');
}

/// The lowest balance from today on (web's summarizeLowPoints().upcoming).
int upcomingLow(SimulationResult sim, int? currentDay) {
  final days = currentDay == null ? sim.days : sim.days.where((d) => d.day >= currentDay).toList();
  if (days.isEmpty) return sim.lowestBalance;
  return days.map((d) => d.closingBalance).reduce((a, b) => a < b ? a : b);
}

class UpcomingItem {
  const UpcomingItem(this.event, this.outflow, this.isOverdue, this.isDueToday, this.dueDate);
  final TimelineEvent event;
  final int outflow;
  final bool isOverdue;
  final bool isDueToday;
  final String dueDate;
}

String _addDays(String date, int n) =>
    DateTime.parse('${date}T00:00:00Z').add(Duration(days: n)).toIso8601String().substring(0, 10);

/// Planned outflows in the next [windowDays] days, overdue ones first.
({List<UpcomingItem> items, int total, int overdueCount, int? daysToSalary}) getUpcomingOutflows(
    List<TimelineEvent> events, String today,
    {int windowDays = 7}) {
  final windowEnd = _addDays(today, windowDays < 1 ? 0 : windowDays - 1);
  final items = <UpcomingItem>[];
  String? nextSalary;
  for (final e in events) {
    final r = e.raw;
    if (e.date.isEmpty) continue;
    final isActual = r['isActual'] == true;
    if (r['isSalary'] == true && !isActual && e.date.compareTo(today) >= 0) {
      if (nextSalary == null || e.date.compareTo(nextSalary) < 0) nextSalary = e.date;
    }
    final isTransfer = r['itemType'] == 'transfer' || r['origin'] == 'transfer' || r['transferId'] != null;
    if (isTransfer || isActual || r['isPaid'] == true || e.amount >= 0) continue;
    final isPending = r['isPending'] == true;
    final isOverdue = isPending || e.date.compareTo(today) < 0;
    final inWindow = e.date.compareTo(today) >= 0 && e.date.compareTo(windowEnd) <= 0;
    if (!isOverdue && !inWindow) continue;
    final original = r['originalDate']?.toString();
    items.add(UpcomingItem(e, -e.amount, isOverdue, !isOverdue && e.date == today,
        isPending && original != null ? original : e.date));
  }
  items.sort((a, b) {
    if (a.isOverdue != b.isOverdue) return a.isOverdue ? -1 : 1;
    final c = a.dueDate.compareTo(b.dueDate);
    return c != 0 ? c : b.outflow - a.outflow;
  });
  final daysToSalary =
      nextSalary == null ? null : DateTime.parse(nextSalary).difference(DateTime.parse(today)).inDays;
  return (
    items: items,
    total: items.fold(0, (s, i) => s + i.outflow),
    overdueCount: items.where((i) => i.isOverdue).length,
    daysToSalary: daysToSalary,
  );
}

class AllowancePace {
  const AllowancePace({
    required this.allowance,
    required this.spent,
    required this.expectedByToday,
    required this.status,
    required this.usedRatio,
    required this.expectedRatio,
  });
  final int allowance, spent, expectedByToday;
  final String status; // on | under | over
  final double usedRatio, expectedRatio;
  int get left => allowance - spent;
  int get delta => spent - expectedByToday;
}

/// Envelope pacing for the unplanned allowance (getAllowancePace on web):
/// spent so far against an even pace for today. Null when there is no allowance.
AllowancePace? getAllowancePace({
  required int unplannedAllowance,
  required int totalUnplannedSpent,
  int daysElapsed = 1,
  int daysInMonth = 30,
}) {
  if (unplannedAllowance <= 0) return null;
  final spent = totalUnplannedSpent < 0 ? 0 : totalUnplannedSpent;
  final totalDays = daysInMonth < 1 ? 1 : daysInMonth;
  final elapsed = daysElapsed.clamp(0, totalDays);
  final expected = (unplannedAllowance * elapsed / totalDays).round();
  final delta = spent - expected;
  final tolerance = (unplannedAllowance * 0.05).round();
  final status = delta > tolerance ? 'over' : (delta < -tolerance ? 'under' : 'on');
  return AllowancePace(
    allowance: unplannedAllowance,
    spent: spent,
    expectedByToday: expected,
    status: status,
    usedRatio: (spent / unplannedAllowance).clamp(0, 1).toDouble(),
    expectedRatio: (elapsed / totalDays).clamp(0, 1).toDouble(),
  );
}

/// A spend the engine counts in its expense total: money out that isn't a
/// transfer, held/lent money or a card bill payment (simulator.js grossSimExpenses).
bool isSpendEvent(TimelineEvent e) {
  final t = e.raw['itemType'];
  return e.amount < 0 && t != 'transfer' && t != 'pass-through' && t != 'card-bill';
}

/// One account's timeline (web PlanScreen's activeEvents): the server's
/// per-account simulations carry balances only, no events, so take the
/// all-accounts events that touch [accountId] and show that account's balance
/// after each. A transfer reads as money out of its source, in to its destination.
/// Salary and entries with no account land on the salary bank, else the
/// primary or only bank. A card swipe moves no bank cash and never falls back.
List<TimelineEvent> eventsForAccount(
  SimulationResult sim,
  String accountId, {
  required bool isBank,
  bool isPrimary = false,
  bool isSoleBank = false,
  String? salaryBankId,
}) {
  String? id(Object? v) => v == null || '$v'.isEmpty ? null : '$v';
  final isSalaryBank = salaryBankId != null && salaryBankId == accountId;
  final fallbackBank = isBank && (isPrimary || isSalaryBank || isSoleBank);
  final out = <TimelineEvent>[];
  for (final e in sim.allEvents) {
    final r = e.raw;
    final src = id(r['sourceBankAccountId']) ?? id(r['sourceWalletId']) ?? id(r['sourceAccountId']);
    final dst = id(r['destinationBankAccountId']) ?? id(r['destinationWalletId']) ?? id(r['destinationAccountId']);
    final own = [id(r['accountId']), id(r['bankAccountId']), id(r['walletId'])];
    final isSalary = r['isSalary'] == true || r['itemType'] == 'salary';
    final unassigned = id(r['bankAccountId']) == null && id(r['walletId']) == null && src == null;
    final keep = own.contains(accountId) ||
        src == accountId ||
        dst == accountId ||
        (isSalary && isBank && (isSalaryBank || (salaryBankId == null && (isPrimary || isSoleBank)))) ||
        (unassigned && fallbackBank && r['isCardSpend'] != true);
    if (!keep) continue;

    final isTransfer = r['itemType'] == 'transfer';
    final balances = r['accountBalances'];
    final num? perAccount = balances is Map ? balances[accountId] as num? : null;
    final balance = perAccount ??
        (isTransfer
            ? (src == accountId ? r['sourceAccountBalanceAfter'] : r['destinationAccountBalanceAfter']) as num?
            : r['accountBalanceAfter'] as num?);
    final transferAmount = ((r['transferAmount'] as num?) ?? e.amount).abs();
    out.add(TimelineEvent.fromJson({
      ...r,
      if (isTransfer) 'amount': src == accountId ? -transferAmount : transferAmount,
      'balanceAfter': balance ?? e.runningBalance,
    }));
  }
  return out;
}
