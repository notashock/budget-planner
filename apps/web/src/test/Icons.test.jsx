import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { TrashIcon, EditIcon, CheckCircleIcon, PlusIcon, CalendarIcon } from '../components/Icons.jsx';

describe('Icons component exports', () => {
  it('renders TrashIcon without error', () => {
    const { container } = render(<TrashIcon size={18} className="test-trash" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('test-trash');
    expect(svg?.getAttribute('width')).toBe('18');
  });

  it('renders EditIcon without error', () => {
    const { container } = render(<EditIcon size={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders other basic icons without collision', () => {
    const { container } = render(
      <div>
        <CheckCircleIcon />
        <PlusIcon />
        <CalendarIcon />
      </div>
    );
    expect(container.querySelectorAll('svg').length).toBe(3);
  });
});
