import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/budget_provider.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _inputCtrl = TextEditingController();
  final List<Map<String, String>> _messages = [
    {
      'role': 'assistant',
      'text': 'Hello! I am your AI Budget Copilot. You can ask me to parse unstructured expenses (e.g. "dinner yesterday 450") or analyze your cashflow trajectory.'
    }
  ];
  bool _thinking = false;

  @override
  void dispose() {
    _inputCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final budget = context.watch<BudgetProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Column(
        children: [
          // Quick Action Suggestion Chips
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkBg : AppColors.lightBg,
              border: Border(bottom: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ActionChip(
                    label: const Text('Explain Cashflow Trajectory'),
                    onPressed: () => _explainTimeline(budget),
                  ),
                  const SizedBox(width: 8),
                  ActionChip(
                    label: const Text('Parse "Coffee 150 today"'),
                    onPressed: () {
                      _inputCtrl.text = 'Coffee 150 today';
                      _sendMessage();
                    },
                  ),
                ],
              ),
            ),
          ),

          // Chat Messages
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isUser = msg['role'] == 'user';

                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: isUser
                          ? (isDark ? Colors.white : Colors.black)
                          : (isDark ? AppColors.darkSurface : AppColors.lightSurface),
                      borderRadius: BorderRadius.circular(10),
                      border: isUser
                          ? null
                          : Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
                    ),
                    child: Text(
                      msg['text'] ?? '',
                      style: TextStyle(
                        fontSize: 13,
                        color: isUser
                            ? (isDark ? Colors.black : Colors.white)
                            : (isDark ? AppColors.darkText : AppColors.lightText),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          if (_thinking)
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 8),
                  Text('Thinking...', style: TextStyle(fontSize: 12, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted)),
                ],
              ),
            ),

          // Message Input Field
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
              border: Border(top: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _inputCtrl,
                    decoration: InputDecoration(
                      hintText: 'Ask or type transaction text...',
                      hintStyle: TextStyle(fontSize: 13, color: isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(20)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      isDense: true,
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send, size: 20),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _sendMessage() async {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty || _thinking) return;

    setState(() {
      _messages.add({'role': 'user', 'text': text});
      _thinking = true;
    });
    _inputCtrl.clear();

    try {
      final res = await ApiService().parseTextAi(text);
      String reply = 'Understood.';
      if (res['parsed'] != null) {
        reply = 'Parsed item: ${res['parsed']}';
      } else if (res['explanation'] != null) {
        reply = res['explanation'].toString();
      } else if (res['result'] != null) {
        reply = res['result'].toString();
      }

      setState(() {
        _messages.add({'role': 'assistant', 'text': reply});
      });
    } catch (e) {
      setState(() {
        _messages.add({'role': 'assistant', 'text': 'Error communicating with AI: $e'});
      });
    } finally {
      setState(() => _thinking = false);
    }
  }

  Future<void> _explainTimeline(BudgetProvider budget) async {
    if (_thinking) return;
    setState(() {
      _messages.add({'role': 'user', 'text': 'Explain my cashflow trajectory'});
      _thinking = true;
    });

    try {
      final sim = budget.simulation;
      final floor = (num.tryParse('${budget.activeMonth?['safetyFloor'] ?? 0}') ?? 0).round();

      final res = await ApiService().explainTimelineAi({
        'lowestBalance': sim?.lowestBalance ?? 0,
        'lowestDay': sim?.lowestBalanceDay ?? 1,
        'safeVelocity': sim?.safeVelocity.safeDailyAmount ?? 0,
        'status': sim?.safeVelocity.status ?? 'healthy',
      }, floor);

      setState(() {
        _messages.add({
          'role': 'assistant',
          'text': res['explanation']?.toString() ?? 'Your projected trajectory maintains a steady safety buffer across this month.'
        });
      });
    } catch (e) {
      setState(() {
        _messages.add({'role': 'assistant', 'text': 'Could not generate explanation: $e'});
      });
    } finally {
      setState(() => _thinking = false);
    }
  }
}
