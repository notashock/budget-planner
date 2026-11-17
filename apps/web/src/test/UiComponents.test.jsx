import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import gsap from 'gsap';
import { Button } from '../components/ui/Button.jsx';
import { Chip } from '../components/ui/Chip.jsx';
import { Card } from '../components/ui/Card.jsx';
import { StatTile } from '../components/ui/StatTile.jsx';
import { playEntrance } from '../components/entranceMotion.js';

describe('Shared UI components', () => {
  it('Button maps variants and sizes onto the shared button classes', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="ghost" size="sm">Cancel</Button>
        <Button variant="danger" block>Delete</Button>
        <Button>Plain</Button>
      </>
    );
    expect(screen.getByText('Save')).toHaveClass('btn', 'btn-primary');
    expect(screen.getByText('Cancel')).toHaveClass('btn-subtle', 'btn-sm');
    expect(screen.getByText('Delete')).toHaveClass('btn-danger', 'btn-block');
    expect(screen.getByText('Plain')).toHaveClass('btn-secondary');
    expect(screen.getByText('Plain')).toHaveAttribute('type', 'button');
  });

  it('Chip always pairs a status tone with an icon and a text label', () => {
    const { container } = render(
      <>
        <Chip tone="good">Credited</Chip>
        <Chip tone="warning">Tight</Chip>
        <Chip tone="critical">Below floor</Chip>
        <Chip>Note</Chip>
      </>
    );
    const chips = container.querySelectorAll('.ui-chip');
    expect(chips).toHaveLength(4);
    expect(chips[0]).toHaveClass('ui-chip-good');
    expect(chips[0].querySelector('svg')).not.toBeNull();
    expect(chips[1].querySelector('svg')).not.toBeNull();
    expect(chips[2].querySelector('svg')).not.toBeNull();
    // neutral carries no status, so no icon by default
    expect(chips[3].querySelector('svg')).toBeNull();
    expect(screen.getByText('Below floor')).toBeInTheDocument();
  });

  it('Card renders the shared surface', () => {
    render(<Card as="div" data-testid="c">Body</Card>);
    expect(screen.getByTestId('c')).toHaveClass('card');
  });

  it('StatTile renders label, value, chips and subtext in one skeleton', () => {
    const { container } = render(
      <StatTile label="Lowest balance" value="₹5,400" tone="breached" chips={<Chip tone="critical">Below floor</Chip>} subtext="Nov 25" />
    );
    expect(container.firstChild).toHaveClass('kpi-card', 'kpi-card-breached');
    expect(screen.getByText('Lowest balance')).toHaveClass('summary-label');
    expect(screen.getByText('₹5,400')).toHaveClass('summary-value');
    expect(screen.getByText('Nov 25')).toHaveClass('kpi-subtext');
  });
});

describe('Entrance motion leaves content visible', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not animate (so nothing starts at opacity 0) when reduced motion is preferred', () => {
    const spy = vi.spyOn(gsap, 'fromTo');
    const original = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const el = document.createElement('div');
    playEntrance([el]);
    expect(spy).not.toHaveBeenCalled();
    expect(el.style.opacity).toBe('');
    window.matchMedia = original;
  });

  it('does not animate while the tab is hidden', () => {
    const spy = vi.spyOn(gsap, 'fromTo');
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    playEntrance([document.createElement('div')]);
    expect(spy).not.toHaveBeenCalled();
    delete document.hidden;
    if (desc) Object.defineProperty(Document.prototype, 'hidden', desc);
  });
});
