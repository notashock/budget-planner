import 'package:dynamic_color/dynamic_color.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'providers/theme_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/budget_provider.dart';
import 'providers/app_lock_provider.dart';
import 'theme/app_theme.dart';
import 'theme/app_colors.dart';
import 'theme/app_typography.dart';
import 'screens/auth_screen.dart';
import 'screens/plan_screen.dart';
import 'screens/transactions_screen.dart';
import 'screens/goals_screen.dart';
import 'screens/accounts_screen.dart';
import 'screens/assistant_screen.dart';
import 'widgets/header.dart';
import 'widgets/load_error_banner.dart';
import 'widgets/sync_strip.dart';
import 'widgets/app_lock_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Draw behind the status and navigation bars (upgrade plan 3.2); SafeArea
  // and the bottom bar keep content clear of them.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  AppTypography.useBundledFonts();

  final themeProvider = ThemeProvider();
  await themeProvider.init();

  final authProvider = AuthProvider();
  await authProvider.init();

  // Before the first frame, so a locked app never shows its contents.
  final appLock = AppLockProvider();
  await appLock.init();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: themeProvider),
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider.value(value: appLock),
        ChangeNotifierProvider(create: (_) => BudgetProvider()),
      ],
      child: const BudgetMobileApp(),
    ),
  );
}

class BudgetMobileApp extends StatefulWidget {
  const BudgetMobileApp({super.key});

  @override
  State<BudgetMobileApp> createState() => _BudgetMobileAppState();
}

class _BudgetMobileAppState extends State<BudgetMobileApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    context.read<AppLockProvider>().handleLifecycle(state);
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();
    final authProvider = context.watch<AuthProvider>();

    // Device colours, when the user turned them on and the phone has them
    // (Android 12+): only the accent changes, never the money colours.
    return DynamicColorBuilder(
      builder: (lightDynamic, darkDynamic) => MaterialApp(
        title: 'Budget Planner',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.build(
          Brightness.light,
          accent: themeProvider.deviceColors ? lightDynamic?.primary : null,
        ),
        darkTheme: AppTheme.build(
          Brightness.dark,
          accent: themeProvider.deviceColors ? darkDynamic?.primary : null,
        ),
        themeMode: themeProvider.themeMode,
        // App lock sits above the navigator, so it also covers open sheets and
        // dialogs. The app underneath stays mounted (state kept) but offstage:
        // not painted and not read by screen readers.
        builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
          // Transparent bars over the app's own background, icons readable
          // in either theme.
          value: _systemBars(Theme.of(context).brightness),
          child: AppLockGate(
            signedIn: authProvider.isAuthenticated,
            child: child ?? const SizedBox.shrink(),
          ),
        ),
        home: authProvider.isLoading
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : (authProvider.isAuthenticated
                  ? const AppShell()
                  : const AuthScreen()),
      ),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    PlanScreen(),
    TransactionsScreen(),
    GoalsScreen(),
    AccountsScreen(),
    AssistantScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<BudgetProvider>().loadInitialData();
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // A 401 on any load means the token is no longer valid: back to sign-in.
    final sessionExpired = context.select<BudgetProvider, bool>(
      (b) => b.loadError?.isSessionExpired ?? false,
    );
    if (sessionExpired) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<AuthProvider>().sessionExpired();
      });
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const HeaderWidget(),
            const LoadErrorBanner(),
            const SyncStrip(),
            Expanded(
              child: IndexedStack(index: _currentIndex, children: _screens),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              width: 1,
            ),
          ),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.timeline_outlined),
              activeIcon: Icon(Icons.timeline),
              label: 'Plan',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.receipt_long_outlined),
              activeIcon: Icon(Icons.receipt_long),
              label: 'Transactions',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.auto_awesome_outlined),
              activeIcon: Icon(Icons.auto_awesome),
              label: 'Goals',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.account_balance_outlined),
              activeIcon: Icon(Icons.account_balance),
              label: 'Accounts',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.chat_bubble_outline),
              activeIcon: Icon(Icons.chat_bubble),
              label: 'Assistant',
            ),
          ],
        ),
      ),
    );
  }
}

SystemUiOverlayStyle _systemBars(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarContrastEnforced: false,
    statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    statusBarBrightness: brightness, // iOS
    systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
  );
}
