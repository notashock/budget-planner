import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Header } from '../components/Header.jsx';
import { BottomNav } from '../components/BottomNav.jsx';
import { PageTitle } from '../components/PageTitle.jsx';

describe("Consistent navigation and page titles", () => {
  it("uses the same tab order on phone and desktop: Plan, Transactions, Goals, Accounts", () => {
    const { container: desktop } = render(<Header months={[]} currentMonth={null} activeTab="plan" onSelectTab={vi.fn()} />);
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

  it("opens the AI assistant from the profile menu", () => {
    const onSelectTab = vi.fn();
    render(
      <Header
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

  it("renders one h1 page title with a subtitle", () => {
    render(<PageTitle title="Goals" subtitle="Things you are saving for." />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Goals');
    expect(screen.getByText('Things you are saving for.')).toBeInTheDocument();
  });
});
