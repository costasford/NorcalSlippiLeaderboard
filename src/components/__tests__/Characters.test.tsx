import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Characters } from '../Characters';
import { Player, CharacterStats } from '../../lib/player';

jest.mock('../Character', () => ({
  Character: ({ stats }: { stats: CharacterStats }) => (
    <div data-testid="character">{stats.character}</div>
  ),
}));

jest.mock('react-responsive', () => ({
  useMediaQuery: jest.fn(() => true),
}));

const makePlayer = (characters: CharacterStats[]): Player => ({
  displayName: 'TestPlayer',
  connectCode: { code: 'TEST#123' },
  rankedNetplayProfile: {
    ratingOrdinal: 1000,
    ratingUpdateCount: 10,
    wins: 5,
    losses: 5,
    dailyGlobalPlacement: null,
    dailyRegionalPlacement: null,
    characters,
  },
});

const characterList = (count: number): CharacterStats[] => Array.from(
  { length: count },
  (_, i) => ({ character: `CHAR_${i}`, gameCount: count - i }),
);

describe('Characters', () => {
  it('shows all characters when there are few enough not to condense', () => {
    render(<Characters player={makePlayer(characterList(4))} totalGames={10} />);
    expect(screen.getAllByTestId('character')).toHaveLength(4);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sorts characters by game count descending', () => {
    const shuffled: CharacterStats[] = [
      { character: 'LOW', gameCount: 1 },
      { character: 'HIGH', gameCount: 10 },
      { character: 'MID', gameCount: 5 },
    ];
    render(<Characters player={makePlayer(shuffled)} totalGames={16} />);
    const rendered = screen.getAllByTestId('character').map((el) => el.textContent);
    expect(rendered).toEqual(['HIGH', 'MID', 'LOW']);
  });

  it('condenses to the top 3 with a "+N more" toggle when there are more than 4', () => {
    render(<Characters player={makePlayer(characterList(6))} totalGames={21} />);
    expect(screen.getAllByTestId('character')).toHaveLength(3);
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('more')).toBeInTheDocument();
  });

  it('expands to show every character when the toggle is clicked', () => {
    render(<Characters player={makePlayer(characterList(6))} totalGames={21} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByTestId('character')).toHaveLength(6);
    expect(screen.getByText('Hide')).toBeInTheDocument();
  });

  it('collapses back to the condensed view when "Hide" is clicked', () => {
    render(<Characters player={makePlayer(characterList(6))} totalGames={21} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Hide'));
    expect(screen.getAllByTestId('character')).toHaveLength(3);
  });

  it('expands via the Enter key for keyboard accessibility', () => {
    render(<Characters player={makePlayer(characterList(6))} totalGames={21} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(screen.getAllByTestId('character')).toHaveLength(6);
  });
});
