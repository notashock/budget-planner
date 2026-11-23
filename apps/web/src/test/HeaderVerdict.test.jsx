import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '../components/Header.jsx';
import { getUnifiedVerdict } from '@budget/engine';

const month = { _id: 'm1', year: 2026, month: 11, safetyFloor: 100000, currencySymbol: '₹' };

const sim = (over = {}) => ({
  safetyFloor: 100000,
  lowestBalance: 500000,
  lowestUpcomingBalance: 500000,
  floorBreached: false,
  safeVelocity: { safeVelocityPerDay: 2000, paceStatus: 'stable' },
  ...over
});

describe("Toolbar Today lozenge matches the Plan page", () => {
  it("shows the verdict the Plan page reports for the scope being viewed", () => {
    render(
      <Header
        months={[month]}
        currentMonth={month}
        activeTab="transactions"
        simulation={sim()}
        verdict={{ key: 'tight', label: 'Tight month', headroom: { amount: 5000 }, scope: 'ICICI Current' }}
      />
    );
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent(/₹20\s*safe today · \d+ days? left/);
    expect(pill).toHaveClass('tight');
    expect(pill.getAttribute('title')).toMatch(/^ICICI Current: Tight month/);
    expect(screen.queryByText('Floor Safe')).not.toBeInTheDocument();
  });

  it("falls back to the engine's all-accounts verdict, using the engine floor and the upcoming low", () => {
    // The month record says a 1,000 floor, but the engine's unified floor is 6,000 and the
    // upcoming low (5,500) is under it, so the header must say "Below floor", not "safe".
    render(<Header months={[month]} currentMonth={month} activeTab="goals" simulation={sim({ safetyFloor: 600000, lowestUpcomingBalance: 550000 })} />);
    expect(screen.getByRole('status')).toHaveClass('breached');
    expect(screen.getByRole('status').getAttribute('title')).toMatch(/^All accounts: Below floor/);

    expect(getUnifiedVerdict(sim({ safetyFloor: 500000 })).key).toBe('tight');
    expect(getUnifiedVerdict(sim()).key).toBe('good');
    expect(getUnifiedVerdict(null)).toBeNull();
  });

  it('leaves the verdict to the Plan page hero when Plan is open, so it is not shown twice', () => {
    render(<Header months={[month]} currentMonth={month} activeTab="plan" simulation={sim()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
