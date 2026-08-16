export interface CharacterStats {
  character: string;
  gameCount: number;
}

interface RankedNetplayProfile {
  rank?: number; // populated separately
  ratingOrdinal: number;
  ratingUpdateCount: number;
  wins: number;
  losses: number;
  dailyGlobalPlacement: number | null;
  dailyRegionalPlacement: number | null;
  characters: CharacterStats[];
}

// The "old" comparison snapshot comes from cron's daily history file (see
// HistorySnapshotEntry in cron/fetchStats.ts), which only ever has a rank
// and a rating - never the full live profile.
export interface OldRankedProfile {
  rank: number | null;
  ratingOrdinal: number;
}

export interface Player {
  displayName: string;
  connectCode: {
    code: string;
  };
  rankedNetplayProfile: RankedNetplayProfile
  oldRankedNetplayProfile?: OldRankedProfile // populated separately
}
