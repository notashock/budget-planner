import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../engine/engine.dart';
import '../models/person_fund.dart';
import '../theme/app_palette.dart';
import '../widgets/app_date_picker.dart';
import 'card_modals.dart' show AppSheet;

/// Web's People-panel names for an entry's direction.
const heldLentVerb = {
  'held_in': 'Received to hold',
  'held_return': 'Returned',
  'lent_out': 'Lent',
  'lent_repaid': 'Paid back',
};

String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Cancel and Save, as web's hl-form-actions.
Widget _actions(BuildContext context, {required bool saving, required VoidCallback? onSave}) => Row(children: [
      Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))),
      const SizedBox(width: 12),
      Expanded(
        child: ElevatedButton(
          key: const ValueKey('hl-save'),
          onPressed: saving ? null : onSave,
          child: Text(saving ? 'Saving…' : 'Save'),
        ),
      ),
    ]);

Widget _errorLine(BuildContext context, String? error) => error == null
    ? const SizedBox(height: 16)
    : Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Text(error, style: TextStyle(color: context.palette.badInk, fontSize: 13)),
      );

/// Edit a person's name, note and expected settle date (web's PersonForm).
class PersonEditSheet extends StatefulWidget {
  final PersonFund fund;
  const PersonEditSheet({super.key, required this.fund});

  @override
  State<PersonEditSheet> createState() => _PersonEditSheetState();
}

class _PersonEditSheetState extends State<PersonEditSheet> {
  late final _name = TextEditingController(text: widget.fund.personName);
  late final _note = TextEditingController(text: widget.fund.note ?? '');
  late String? _expected = widget.fund.expectedSettleDate;
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await context.read<BudgetProvider>().updatePersonFund(widget.fund.id, {
        'personName': _name.text.trim(),
        'note': _note.text.trim(),
        'expectedSettleDate': _expected,
      });
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().isEmpty ? 'Could not save.' : e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final held = widget.fund.direction == FundDirection.held;
    final p = context.palette;
    return AppSheet(title: 'Edit ${widget.fund.personName}', children: [
      TextField(
        key: const ValueKey('hl-edit-name'),
        controller: _name,
        maxLength: 80,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Name', counterText: ''),
      ),
      const SizedBox(height: 10),
      TextField(
        key: const ValueKey('hl-edit-note'),
        controller: _note,
        decoration: const InputDecoration(labelText: 'Note', hintText: 'Optional'),
      ),
      const SizedBox(height: 10),
      Text(held ? 'Give back by' : 'Back by', style: TextStyle(fontSize: 12, color: p.textSecondary)),
      Row(children: [
        Expanded(
          child: TextButton(
            key: const ValueKey('hl-edit-date'),
            style: TextButton.styleFrom(alignment: Alignment.centerLeft),
            onPressed: () async {
              final picked = await showAppDatePicker(context, DateTime.tryParse(_expected ?? '') ?? DateTime.now());
              if (picked != null) setState(() => _expected = _ymd(picked));
            },
            child: Text(_expected == null ? 'No date' : formatDisplayDate(_expected!, includeWeekday: false)),
          ),
        ),
        if (_expected != null)
          IconButton(
            tooltip: 'Clear date',
            icon: const Icon(Icons.close, size: 18),
            onPressed: () => setState(() => _expected = null),
          ),
      ]),
      _errorLine(context, _error),
      _actions(context, saving: _saving, onSave: _name.text.trim().isEmpty ? null : _save),
    ]);
  }
}

/// Edit one Held & Lent entry's amount and date; its direction stays (web's EntryForm).
class HeldLentEntryEditSheet extends StatefulWidget {
  final Map<String, dynamic> entry;
  const HeldLentEntryEditSheet({super.key, required this.entry});

  @override
  State<HeldLentEntryEditSheet> createState() => _HeldLentEntryEditSheetState();
}

class _HeldLentEntryEditSheetState extends State<HeldLentEntryEditSheet> {
  late final int _signed = (widget.entry['amount'] as num? ?? 0).toInt();
  late final _amount = TextEditingController(
      text: (_signed.abs() / 100).toStringAsFixed(_signed.abs() % 100 == 0 ? 0 : 2));
  late DateTime _date = DateTime.tryParse('${widget.entry['date']}') ?? DateTime.now();
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final minor = toMinorUnits(num.tryParse(_amount.text) ?? 0);
    if (minor <= 0) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await context.read<BudgetProvider>().updateTransaction('${widget.entry['id'] ?? widget.entry['_id']}', {
        'amount': (_signed < 0 ? -1 : 1) * minor,
        'date': _ymd(_date),
      });
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().isEmpty ? 'Could not save.' : e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verb = heldLentVerb[widget.entry['origin']] ?? '${widget.entry['name'] ?? ''}';
    return AppSheet(title: 'Edit “$verb”', children: [
      TextField(
        key: const ValueKey('hl-entry-amount'),
        controller: _amount,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: 'Amount ($moneySymbol)'),
      ),
      const SizedBox(height: 10),
      AppDatePickerField(label: 'Date', selectedDate: _date, onDateSelected: (d) => setState(() => _date = d)),
      _errorLine(context, _error),
      _actions(context, saving: _saving, onSave: _save),
    ]);
  }
}
