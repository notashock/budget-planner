import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableItemPicker } from '../components/SearchableItemPicker.jsx';

const mockItems = [
  { _id: 'item-1', name: 'Apartment Rent', amount: 2500000, type: 'expense', isFixed: true },
  { _id: 'item-2', name: 'Grocery Budget', amount: 800000, type: 'expense', isFixed: false },
  { _id: 'item-3', name: 'Freelance Payout', amount: 1500000, type: 'income', isFixed: false }
];

describe('SearchableItemPicker component', () => {
  it('renders trigger button with placeholder when no item is selected', () => {
    render(
      <SearchableItemPicker
        items={mockItems}
        selectedId=""
        placeholder="Select budget item"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Select budget item')).toBeInTheDocument();
  });

  it('renders selected item name, amount, and badge', () => {
    render(
      <SearchableItemPicker
        items={mockItems}
        selectedId="item-1"
        currencySymbol="₹"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Apartment Rent')).toBeInTheDocument();
    expect(screen.getByText('(₹25,000.00)')).toBeInTheDocument();
    expect(screen.getByText('Fixed')).toBeInTheDocument();
  });

  it('opens upward popover menu when clicked and filters list on search', () => {
    render(
      <SearchableItemPicker
        items={mockItems}
        selectedId=""
        currencySymbol="₹"
        onSelect={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Apartment Rent')).toBeInTheDocument();
    expect(screen.getByText('Grocery Budget')).toBeInTheDocument();

    // Type in search input
    const searchInput = screen.getByPlaceholderText(/search planned items/i);
    fireEvent.change(searchInput, { target: { value: 'Rent' } });

    expect(screen.getByText('Apartment Rent')).toBeInTheDocument();
    expect(screen.queryByText('Grocery Budget')).not.toBeInTheDocument();
  });

  it('invokes onSelect with item ID when option is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SearchableItemPicker
        items={mockItems}
        selectedId=""
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const rentOption = screen.getByText('Apartment Rent');
    fireEvent.click(rentOption);

    expect(onSelect).toHaveBeenCalledWith('item-1');
  });

  it('allows choosing unmapped/unexpected spending option', () => {
    const onSelect = vi.fn();
    render(
      <SearchableItemPicker
        items={mockItems}
        selectedId="item-1"
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const unexpectedOption = screen.getByText('Unexpected spending');
    fireEvent.click(unexpectedOption);

    expect(onSelect).toHaveBeenCalledWith('');
  });
});
