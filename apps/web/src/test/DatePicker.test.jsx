import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../components/DatePicker.jsx';

describe('DatePicker component', () => {
  it('renders trigger button with placeholder when empty', () => {
    render(<DatePicker value="" placeholder="Pick a date" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /pick a date/i })).toBeInTheDocument();
  });

  it('renders formatted date when value is provided', () => {
    render(<DatePicker value="2026-10-15" onChange={vi.fn()} />);

    expect(screen.getByText(/Oct 15, 2026/i)).toBeInTheDocument();
  });

  it('opens popover dialog on click and displays month/year navigation', () => {
    render(<DatePicker value="2026-10-15" onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /oct 15, 2026/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: /choose date/i })).toBeInTheDocument();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
  });

  it('allows selecting a date cell and calls onChange with YYYY-MM-DD', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-15" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /oct 15, 2026/i }));

    // Find day button for the 20th
    const dayButtons = screen.getAllByRole('button', { name: '20' });
    expect(dayButtons.length).toBeGreaterThan(0);

    fireEvent.click(dayButtons[0]);
    expect(onChange).toHaveBeenCalledWith('2026-10-20');
  });

  it('navigates previous and next months', () => {
    render(<DatePicker value="2026-10-15" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /oct 15, 2026/i }));
    expect(screen.getByText('October 2026')).toBeInTheDocument();

    const prevBtn = screen.getByTitle(/previous month/i);
    fireEvent.click(prevBtn);
    expect(screen.getByText('September 2026')).toBeInTheDocument();

    const nextBtn = screen.getByTitle(/next month/i);
    fireEvent.click(nextBtn);
    expect(screen.getByText('October 2026')).toBeInTheDocument();
  });

  it('closes popover on Escape key', () => {
    render(<DatePicker value="2026-10-15" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /oct 15, 2026/i }));
    expect(screen.getByRole('dialog', { name: /choose date/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /choose date/i })).not.toBeInTheDocument();
  });
});
