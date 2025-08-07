import { getRank } from '../../lib/ranks';
import { Player } from '../../lib/player';

// Mock player data for testing
const mockPlayer: Player = {
  displayName: 'TestPlayer',
  connectCode: { code: 'TEST#123' },
  rankedNetplayProfile: {
    ratingOrdinal: 1500,
    ratingUpdateCount: 25,
    wins: 10,
    losses: 5,
    rank: 1,
    characters: [
      { character: 'FOX', gameCount: 8 },
      { character: 'FALCO', gameCount: 7 }
    ],
    dailyGlobalPlacement: null,
    dailyRegionalPlacement: null
  }
};

describe('Rank system', () => {
  test('getRank returns correct rank for rating', () => {
    const rank = getRank(mockPlayer);
    expect(rank.name).toBeDefined();
    expect(typeof rank.name).toBe('string');
  });

  test('getRank handles player with no games', () => {
    const noGamesPlayer: Player = {
      ...mockPlayer,
      rankedNetplayProfile: {
        ...mockPlayer.rankedNetplayProfile,
        wins: 0,
        losses: 0
      }
    };
    const rank = getRank(noGamesPlayer);
    expect(rank.name).toBe('None');
  });
});