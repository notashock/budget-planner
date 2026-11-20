import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import 'budget_provider.dart';

extension BudgetView on BuildContext {
  /// The [BudgetProvider], rebuilding this widget only when what screens draw
  /// from changes ([BudgetProvider.viewState]: data, month, loading, load
  /// error). A save in flight or the sync strip does not rebuild it (upgrade
  /// plan 2.2 / 2.3). Widgets that show save progress select that on its own.
  BudgetProvider budgetView() {
    select<BudgetProvider, Object>((b) => b.viewState);
    return read<BudgetProvider>();
  }
}
