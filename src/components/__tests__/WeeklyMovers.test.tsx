import React from 'react';
import { render, screen } from '@testing-library/react';
import { WeeklyMovers, WeeklyMoversData } from '../WeeklyMovers';

const buildData = (overrides: Partial<WeeklyMoversData> = {}): WeeklyMoversData => ({
  comparisonDate: '2026-08-01',
  gainers: [
    {
      code: 'GAIN#1', name: 'Gainer One', oldRating: 1000, newRating: 1100, delta: 100,
    },
  ],
  losers: [
    {
      code: 'LOSE#1', name: 'Loser One', oldRating: 1000, newRating: 900, delta: -100,
    },
  ],
  ...overrides,
});

describe('WeeklyMovers', () => {
  it('renders gainers with a + prefix and losers with a - sign', () => {
    render(<WeeklyMovers data={buildData()} />);
    expect(screen.getByText('Gainer One')).toBeInTheDocument();
    expect(screen.getByText('+100')).toBeInTheDocument();
    expect(screen.getByText('Loser One')).toBeInTheDocument();
    expect(screen.getByText('-100')).toBeInTheDocument();
  });

  it('links each player to their Slippi profile from their connect code', () => {
    render(<WeeklyMovers data={buildData()} />);
    const link = screen.getByText('Gainer One').closest('a');
    expect(link).toHaveAttribute('href', 'https://slippi.gg/user/gain-1');
  });

  it('shows a fallback message when a list is empty', () => {
    render(<WeeklyMovers data={buildData({ losers: [] })} />);
    expect(screen.getByText('Not enough data yet.')).toBeInTheDocument();
  });

  it('rounds fractional deltas for display', () => {
    const data = buildData({
      gainers: [{
        code: 'G#1', name: 'G', oldRating: 1000, newRating: 1000.6, delta: 0.6,
      }],
    });
    render(<WeeklyMovers data={data} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
