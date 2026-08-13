import {
  render, screen, waitFor, fireEvent,
} from '@testing-library/react';
import HomePage from '../HomePage';
import { Player } from '../../../../lib/player';

jest.mock('../../../Table', () => ({
  Table: ({ players }: { players: Player[] }) => (
    <div data-testid="table">{players.map((p) => p.displayName).join(',')}</div>
  ),
}));

jest.mock('../../../../../settings', () => ({
  title: 'Test Leaderboard',
  dataBaseUrl: 'https://example.test/leaderboard',
}));

const makePlayer = (
  name: string,
  code: string,
  rating: number,
  wins: number,
  losses: number,
): Player => ({
  displayName: name,
  connectCode: { code },
  rankedNetplayProfile: {
    ratingOrdinal: rating,
    ratingUpdateCount: wins + losses,
    wins,
    losses,
    dailyGlobalPlacement: null,
    dailyRegionalPlacement: null,
    characters: [],
  },
});

const players = [
  makePlayer('Alpha', 'ALPH#1', 2000, 10, 2),
  makePlayer('Beta', 'BETA#2', 1800, 5, 5),
  makePlayer('Charlie', 'CHAR#3', 1600, 3, 3),
];

const moversData = {
  comparisonDate: '2026-08-01',
  gainers: [{
    code: 'ALPH#1', name: 'Alpha', oldRating: 1900, newRating: 2000, delta: 100,
  }],
  losers: [{
    code: 'CHAR#3', name: 'Charlie', oldRating: 1700, newRating: 1600, delta: -100,
  }],
};

const mockFetchResponses = (overrides: Record<string, unknown> = {}) => {
  const responses: Record<string, unknown> = {
    '/players.json': players,
    '/players-previous.json': [],
    '/timestamp.json': { updated: Date.now() },
    '/weekly-movers.json': moversData,
    ...overrides,
  };
  global.fetch = jest.fn((url: string) => {
    const key = Object.keys(responses).find((suffix) => url.endsWith(suffix));
    if (!key || responses[key] === null) {
      return Promise.resolve({ ok: false });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(responses[key]) });
  }) as unknown as typeof fetch;
};

// "Updated ..." is the last state update in the successful load path, so
// waiting for it (rather than an earlier one, like the table appearing)
// lets every queued state update settle before assertions run.
//
// This component still logs a handful of "not wrapped in act(...)"
// warnings during this suite (harmless - all assertions pass). It comes
// from load()'s setState calls firing after a native-fetch promise chain
// resolves outside of any React-tracked act() scope; several explicit
// flush/act-wrapping strategies were tried and none changed it, so it's
// left as known noise rather than working around it further. See PR/commit
// history for what was tried.
const renderAndWaitForLoad = async () => {
  render(<HomePage />);
  await waitFor(() => expect(screen.getByText(/^Updated /)).toBeInTheDocument());
};

describe('HomePage', () => {
  beforeEach(() => {
    mockFetchResponses();
  });

  it('shows a loading state before data arrives', () => {
    render(<HomePage />);
    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();
  });

  it('renders the player list and update time after loading', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByTestId('table')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('table')).toHaveTextContent('Beta');
    expect(screen.getByTestId('table')).toHaveTextContent('Charlie');
  });

  it('shows the weekly movers panel when data is available', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByText('Biggest gainers this week')).toBeInTheDocument();
    expect(screen.getByText('Biggest fallers this week')).toBeInTheDocument();
  });

  it('hides the weekly movers panel when no weekly-movers data exists yet', async () => {
    mockFetchResponses({ '/weekly-movers.json': null });
    await renderAndWaitForLoad();
    expect(screen.queryByText('Biggest gainers this week')).not.toBeInTheDocument();
  });

  it('filters the visible players by display name', async () => {
    await renderAndWaitForLoad();

    fireEvent.change(screen.getByPlaceholderText('Search by tag or name...'), {
      target: { value: 'beta' },
    });

    expect(screen.getByTestId('table')).toHaveTextContent('Beta');
    expect(screen.getByTestId('table')).not.toHaveTextContent('Alpha');
    expect(screen.getByTestId('table')).not.toHaveTextContent('Charlie');
  });

  it('filters the visible players by connect code', async () => {
    await renderAndWaitForLoad();

    fireEvent.change(screen.getByPlaceholderText('Search by tag or name...'), {
      target: { value: 'char#3' },
    });

    expect(screen.getByTestId('table')).toHaveTextContent('Charlie');
    expect(screen.getByTestId('table')).not.toHaveTextContent('Alpha');
  });

  it('shows a no-match message and hides the table when nothing matches', async () => {
    await renderAndWaitForLoad();

    fireEvent.change(screen.getByPlaceholderText('Search by tag or name...'), {
      target: { value: 'zzz-nope' },
    });

    expect(screen.getByText('No players match "zzz-nope".')).toBeInTheDocument();
    expect(screen.queryByTestId('table')).not.toBeInTheDocument();
  });

  it('clearing the search restores the full list', async () => {
    await renderAndWaitForLoad();

    const input = screen.getByPlaceholderText('Search by tag or name...');
    fireEvent.change(input, { target: { value: 'beta' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByTestId('table')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('table')).toHaveTextContent('Beta');
    expect(screen.getByTestId('table')).toHaveTextContent('Charlie');
  });

  it('shows an error message when the players fetch fails', async () => {
    mockFetchResponses({ '/players.json': null });
    render(<HomePage />);
    await waitFor(() => expect(
      screen.getByText(/Couldn't load leaderboard data right now/),
    ).toBeInTheDocument());
  });
});
