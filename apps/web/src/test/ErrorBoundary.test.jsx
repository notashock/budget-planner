import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

function ProblemChild({ shouldThrow = false }) {
  if (shouldThrow) {
    throw new Error('Test crash in child component');
  }
  return <div data-testid="child-content">Normal Content</div>;
}

describe('ErrorBoundary component', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child-content')).toHaveTextContent('Normal Content');
  });

  it('catches render errors and renders fallback UI with error message', () => {
    // Suppress console.error during expected thrown error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary title="Test Section Error">
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Test Section Error')).toBeInTheDocument();
    expect(screen.getByText('Test crash in child component')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();

    spy.mockRestore();
  });

  it('resets error state when "Try again" button is clicked', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let hasThrown = true;

    function ConditionalChild() {
      if (hasThrown) {
        throw new Error('Temporary failure');
      }
      return <div data-testid="recovered-content">Recovered Content</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Fix the error and click try again
    hasThrown = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByTestId('recovered-content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    spy.mockRestore();
  });
});
