import { render, screen } from '@testing-library/react';
import { Row } from '../Row';
import { Player } from '../../lib/player';

jest.mock('../Characters', () => ({
  Characters: () => <div data-testid="characters" />,
}));

const basePlayer = (overrides: Partial<Player> = {}): Player => ({
  displayName: 'TestPlayer',
  connectCode: { code: 'TEST#123' },
  rankedNetplayProfile: {
    ratingOrdinal: 1000,
    ratingUpdateCount: 15,
    wins: 10,
    losses: 5,
    rank: 3,
    dailyGlobalPlacement: null,
    dailyRegionalPlacement: null,
    characters: [{ character: 'FOX', gameCount: 15 }],
  },
  ...overrides,
});

const renderRow = (player: Player) => render(
  <table>
    <tbody>
      <Row player={player} />
    </tbody>
  </table>,
);

describe('Row', () => {
  it('shows the rank number, name, connect code, and rank tier for an active player', () => {
    renderRow(basePlayer());
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('TestPlayer')).toBeInTheDocument();
    expect(screen.getByText('TEST#123')).toBeInTheDocument();
    expect(screen.getByText('Bronze III')).toBeInTheDocument();
  });

  it('links the player name to their Slippi profile', () => {
    renderRow(basePlayer());
    const link = screen.getByText('TestPlayer').closest('a');
    expect(link).toHaveAttribute('href', 'https://slippi.gg/user/test-123');
  });

  it('shows win/loss counts with distinct styling', () => {
    renderRow(basePlayer());
    expect(screen.getByText('10')).toHaveClass('text-green-500');
    expect(screen.getByText('5')).toHaveClass('text-red-500');
  });

  it('does not show a rank number for a player with no ranked games', () => {
    const player = basePlayer({
      rankedNetplayProfile: {
        ratingOrdinal: 0,
        ratingUpdateCount: 0,
        wins: 0,
        losses: 0,
        dailyGlobalPlacement: null,
        dailyRegionalPlacement: null,
        characters: [],
      },
    });
    renderRow(player);
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows a rank-improvement arrow when the rank number decreased', () => {
    const player = basePlayer({
      oldRankedNetplayProfile: { rank: 5, ratingOrdinal: 1000 },
    });
    renderRow(player);
    expect(screen.getByText('▲', { exact: false })).toHaveTextContent('▲ 2');
  });

  it('shows a rank-drop arrow when the rank number increased', () => {
    const player = basePlayer({
      rankedNetplayProfile: { ...basePlayer().rankedNetplayProfile, rank: 8 },
      oldRankedNetplayProfile: { rank: 5, ratingOrdinal: 1000 },
    });
    renderRow(player);
    expect(screen.getByText('▼', { exact: false })).toHaveTextContent('▼ 3');
  });

  it('shows a rating gain indicator with the correct value', () => {
    const player = basePlayer({
      oldRankedNetplayProfile: { rank: 3, ratingOrdinal: 950 },
    });
    renderRow(player);
    expect(screen.getByText('+50')).toBeInTheDocument();
  });

  it('shows a rating loss indicator with the correct value', () => {
    const player = basePlayer({
      oldRankedNetplayProfile: { rank: 3, ratingOrdinal: 1080 },
    });
    renderRow(player);
    expect(screen.getByText('-80')).toBeInTheDocument();
  });

  it('does not show change indicators when there is no previous snapshot', () => {
    renderRow(basePlayer());
    expect(screen.queryByText('▲', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('▼', { exact: false })).not.toBeInTheDocument();
  });

  it('suppresses only the rank arrow (not the rating indicator) when the old snapshot has no rank', () => {
    // A null old rank means the player hadn't played any sets yet when
    // today's snapshot was taken - no ladder position to compare against,
    // but their rating movement since then is still meaningful.
    const player = basePlayer({
      oldRankedNetplayProfile: { rank: null, ratingOrdinal: 950 },
    });
    renderRow(player);
    expect(screen.queryByText('▲', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('▼', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
  });

  it('flags a low set count as still settling', () => {
    const player = basePlayer({
      rankedNetplayProfile: { ...basePlayer().rankedNetplayProfile, ratingUpdateCount: 4 },
    });
    renderRow(player);
    expect(screen.getByText('Only 4 sets counted')).toBeInTheDocument();
  });

  it('does not flag a player with an established set count', () => {
    renderRow(basePlayer());
    expect(screen.queryByText(/sets counted/)).not.toBeInTheDocument();
  });

  it('does not flag an unranked player even with a low count', () => {
    const player = basePlayer({
      rankedNetplayProfile: {
        ratingOrdinal: 0,
        ratingUpdateCount: 0,
        wins: 0,
        losses: 0,
        dailyGlobalPlacement: null,
        dailyRegionalPlacement: null,
        characters: [],
      },
    });
    renderRow(player);
    expect(screen.queryByText(/sets counted/)).not.toBeInTheDocument();
  });
});
