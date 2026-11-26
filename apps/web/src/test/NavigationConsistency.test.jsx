import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { YouMenu } from '../components/YouMenu.jsx';
import { AppSidebar } from '../components/AppSidebar.jsx';
import { BottomNav } from '../components/BottomNav.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';

describe("Consistent navigation and page titles", () => {
  it("uses the same tab order on phone and desktop: Plan, Transactions, Goals, Accounts", () => {
    const { container: desktop } = render(<AppSidebar activeTab="plan" onSelectTab={vi.fn()} />);
    const desktopOrder = Array.from(desktop.querySelectorAll('nav button'))
      .map((b) => b.textContent.trim())
      .filter((t) => ['Plan', 'Transactions', 'Goals', 'Accounts'].includes(t));

    const { container: phone } = render(<BottomNav activeTab="plan" onSelectTab={vi.fn()} />);
    const phoneOrder = Array.from(phone.querySelectorAll('.nav-tab'))
      .map((b) => b.textContent.trim())
      .filter((t) => ['Plan', 'Transactions', 'Goals', 'Accounts'].includes(t));

    expect(desktopOrder).toEqual(['Plan', 'Transactions', 'Goals', 'Accounts']);
    expect(phoneOrder).toEqual(desktopOrder);
  });

  it("selects an account on Plan from the sidebar list", () => {
    const onSelectTab = vi.fn();
    const onSelectAccount = vi.fn();
    render(
      <AppSidebar
        activeTab="goals"
        onSelectTab={onSelectTab}
        onSelectAccount={onSelectAccount}
        accounts={[{ _id: 'b1', name: 'HDFC', currentBalance: 3400000 }]}
        month={{ currencySymbol: '₹' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /HDFC/ }));
    expect(onSelectAccount).toHaveBeenCalledWith('b1');
    expect(onSelectTab).toHaveBeenCalledWith('plan');
  });

  it("opens the AI assistant from the profile menu", () => {
    const onSelectTab = vi.fn();
    render(
      <YouMenu
        months={[]}
        currentMonth={null}
        user={{ name: 'Test', email: 'test@example.com' }}
        activeTab="plan"
        onSelectTab={onSelectTab}
      />
    );
    fireEvent.click(screen.getByLabelText('Account Settings'));
    fireEvent.click(screen.getByTestId('open-assistant-btn'));
    expect(onSelectTab).toHaveBeenCalledWith('assistant');
  });

  it("renders one h1 large title and its actions", () => {
    render(<ScreenHeader title="Goals" actions={<button type="button">Add</button>} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Goals');
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
