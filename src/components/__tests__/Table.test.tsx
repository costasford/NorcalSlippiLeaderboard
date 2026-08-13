import { render, screen } from '@testing-library/react';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Table } from '../Table';
import { Player } from '../../lib/player';

jest.mock('../Row', () => ({
  Row: ({ player }: { player: Player }) => <tr><td>{player.displayName}</td></tr>,
}));

jest.mock('../../lib/useMediaQuery', () => ({
  useMediaQuery: jest.fn(() => true),
}));

const makePlayer = (name: string): Player => ({
  displayName: name,
  connectCode: { code: `${name.toUpperCase()}#0` },
  rankedNetplayProfile: {
    ratingOrdinal: 1000,
    ratingUpdateCount: 10,
    wins: 5,
    losses: 5,
    rank: 1,
    dailyGlobalPlacement: null,
    dailyRegionalPlacement: null,
    characters: [],
  },
});

const useMediaQueryMock = useMediaQuery as jest.Mock;

describe('Table', () => {
  beforeEach(() => {
    useMediaQueryMock.mockReturnValue(true);
  });

  it('renders a header row with the expected columns', () => {
    render(<Table players={[]} />);
    ['Rank', 'Player', 'Rating', 'W/L'].forEach((header) => {
      expect(screen.getByText(header)).toBeInTheDocument();
    });
  });

  it('shows the full "Characters" header on wider viewports', () => {
    useMediaQueryMock.mockReturnValue(true);
    render(<Table players={[]} />);
    expect(screen.getByText('Characters')).toBeInTheDocument();
  });

  it('shows the abbreviated "Char" header on narrow viewports', () => {
    useMediaQueryMock.mockReturnValue(false);
    render(<Table players={[]} />);
    expect(screen.getByText('Char')).toBeInTheDocument();
    expect(screen.queryByText('Characters')).not.toBeInTheDocument();
  });

  it('renders one row per player', () => {
    render(<Table players={[makePlayer('Alpha'), makePlayer('Beta')]} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a loading spinner and no rows when there are no players', () => {
    render(<Table players={[]} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Alpha|Beta/ })).not.toBeInTheDocument();
  });
});
