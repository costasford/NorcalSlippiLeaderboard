import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary fallbackMessage="fallback">
        <div>All good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows the fallback message instead of crashing when a child throws during render', () => {
    // React logs the caught error to console.error even when a boundary
    // handles it - expected noise for this test, not a real failure.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallbackMessage="Something broke, sorry">
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something broke, sorry')).toBeInTheDocument();
    expect(screen.queryByText('All good')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
