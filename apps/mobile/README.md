# Budget Planner — Cross-Platform Flutter Mobile Application

A cross-platform Flutter mobile client for Budget Planner, replicating 1:1 the design, deterministic math engine, and feature set of the web application.

---

## Architecture Overview

1. **Dart Calculation Engine Port (`lib/engine/`)**:
   - Zero-I/O pure Dart port of `@budget/engine`.
   - Computes day-by-day running balance simulation, floor breach detection, dynamic safe daily velocity, and purchase goal feasibility at 60fps without server round-trips.
2. **State Management (`lib/providers/`)**:
   - `AuthProvider`: Stateless JWT token bearer authentication (ADR 0044) with persistent session storage.
   - `ThemeProvider`: Swiss minimalist monochrome theme (Dark, Light, and System modes) matching ADR 0022.
   - `BudgetProvider`: Reactive state holding active month, items, transactions, goals, accounts, wallets, transfers, and live engine simulation.
3. **5 Primary Screens**:
   - **Plan**: Live Step-Line Cashflow Trajectory Chart, Safe Velocity indicator, 4 Metric cards, and Interactive Timeline.
   - **Items**: Budget items and actual transactions with category filtering, edit lock for settled items, and descending day sorting.
   - **Goals**: Purchase Goals with dynamic safe purchase date recommendation badges, priority levels, and conversion to scheduled items.
   - **Accounts**: Bank accounts, digital wallets, total liquid balance, and inter-account transfers.
   - **Assistant**: AI Budget Copilot connected to the backend Gemini AI engine.
4. **Action Modals**:
   - **Unified Entry Modal**: Quick action bottom sheet for logging actual transactions, scheduled budget items, purchase goals, or transfers.
   - **Salary & Safeline Modal**: 10-day salary credit window monitoring, fast salary deposit, credit day, and safety floor configuration.
   - **Month Administration**: New month creation and month rollover.

---

## How to Test on Your Android Mobile Device

### Step 1: Enable USB Debugging on Your Phone
1. On your Android phone, go to **Settings > About Phone**.
2. Tap **Build Number** 7 times to enable **Developer Options**.
3. Go to **Settings > System / Developer Options** and enable **USB Debugging**.
4. Connect your phone to your computer via a USB cable and tap **Allow** when prompted for USB debugging.

### Step 2: Forward Backend Port over USB
In your project terminal, run:
```bash
npm run mobile:reverse
```
*(This executes `adb reverse tcp:4000 tcp:4000`, mapping `http://127.0.0.1:4000` on your mobile phone directly to your computer's local backend server).*

### Step 3: Run the Backend & Mobile App
1. In one terminal, start the server:
   ```bash
   npm run dev:server
   ```
2. In a second terminal, verify your phone is recognized:
   ```bash
   npm run mobile:devices
   ```
3. Launch the app directly on your phone:
   ```bash
   npm run mobile:run
   ```

*(Alternatively, to generate a standalone debug APK to sideload onto your phone, run `npm run mobile:build-apk`)*.

---

## Testing over Local Wi-Fi (Alternative to USB)
If you prefer testing over Wi-Fi without a cable:
1. Ensure both your computer and phone are connected to the same Wi-Fi network.
2. In the mobile app's login screen or top header, tap the **Ethernet / Server Settings** icon.
3. Enter your computer's local LAN IP: `http://192.168.x.x:4000`.
