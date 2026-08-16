import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime'; // import plugin
import { Table } from '../../Table';
import { WeeklyMovers, WeeklyMoversData } from '../../WeeklyMovers';
import { ErrorBoundary } from '../../ErrorBoundary';
import { TagRequestForm } from '../../TagRequestForm';
import { Player, OldRankedProfile } from '../../../lib/player';
import * as settings from '../../../../settings';

dayjs.extend(relativeTime);

const setCount = (player: Player) => player.rankedNetplayProfile.wins
    + player.rankedNetplayProfile.losses;

const sortAndPopulatePlayers = (playerList: Player[]) => {
  const sortedPlayers = playerList.filter((p) => setCount(p))
    .concat(playerList.filter((p) => !setCount(p)));
  sortedPlayers.forEach((currentPlayer: Player, i: number) => {
    const modifiedPlayer = currentPlayer;
    if (setCount(modifiedPlayer) > 0) {
      modifiedPlayer.rankedNetplayProfile.rank = i + 1;
    }
  });
  return sortedPlayers;
};

interface HistorySnapshotEntry {
  code: string;
  rating: number;
  rank: number | null;
}

// Used for endpoints that may not exist yet (e.g. today's history file,
// before the first cron run of the day, or on a brand new deployment) -
// that's fine, it just means no rank/rating-movement data is shown yet.
const fetchJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

export default function HomePage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<dayjs.Dayjs | null>(null);
  const [updateDesc, setUpdateDesc] = useState('');
  const [error, setError] = useState(false);
  const [weeklyMovers, setWeeklyMovers] = useState<WeeklyMoversData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const base = settings.dataBaseUrl;
        // Same UTC-date format cron uses for history/<date>.json, so this
        // always lands on today's snapshot regardless of the viewer's
        // timezone. Comparing against the start of today (rather than the
        // prior 8-minute cron run) is what lets the rank arrows and rating
        // +/- indicators stay visible for a meaningful stretch instead of
        // flickering for a single cycle.
        const today = new Date().toISOString().slice(0, 10);
        const [playersNew, todayHistory, timestamp, movers] = await Promise.all([
          fetchJson(`${base}/players.json`),
          fetchJson(`${base}/history/${today}.json`),
          fetchJson(`${base}/timestamp.json`),
          fetchJson(`${base}/weekly-movers.json`),
        ]);
        if (movers?.gainers && movers?.losers) {
          setWeeklyMovers(movers);
        }

        if (!playersNew) {
          setError(true);
          return;
        }

        const oldDataByCode = new Map<string, OldRankedProfile>(
          ((todayHistory as HistorySnapshotEntry[]) || []).map((p) => [
            p.code,
            { rank: p.rank, ratingOrdinal: p.rating },
          ]),
        );

        const rankedPlayers = sortAndPopulatePlayers(playersNew);
        rankedPlayers.forEach((currentPlayer) => {
          const modifiedPlayer = currentPlayer;
          const oldData = oldDataByCode.get(modifiedPlayer.connectCode.code);
          if (oldData) {
            modifiedPlayer.oldRankedNetplayProfile = oldData;
          }
        });

        setPlayers(rankedPlayers);
        if (timestamp?.updated) {
          const ts = dayjs(timestamp.updated);
          setUpdatedAt(ts);
          setUpdateDesc(ts.fromNow());
        }
      } catch (e) {
        setError(true);
      }
    };
    load();
  }, []);

  // continuously update the "updated X ago" label
  useEffect(() => {
    if (!updatedAt) return undefined;
    const interval = setInterval(
      () => setUpdateDesc(updatedAt.fromNow()), 1000 * 60,
    );
    return () => {
      clearInterval(interval);
    };
  }, [updatedAt]);

  const filteredPlayers = useMemo(() => {
    if (!players) return players;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return players;
    return players.filter(
      (p) => p.displayName.toLowerCase().includes(term)
        || p.connectCode.code.toLowerCase().includes(term),
    );
  }, [players, searchTerm]);

  return (
    <div className="flex flex-col items-center h-screen p-8">
      <h1 className="text-3xl m-4 text-center text-white">
        {settings.title}
      </h1>
      {error && (
        <div className="p-1 text-gray-300">
          Couldn&apos;t load leaderboard data right now - try refreshing in a bit.
        </div>
      )}
      {!error && !players && (
        <div className="p-1 text-gray-300">Loading leaderboard...</div>
      )}
      {players && (
        <>
          <div className="p-1 text-gray-300">
            {`Updated ${updateDesc}`}
          </div>
          <TagRequestForm />
          {weeklyMovers && (
            <ErrorBoundary fallbackMessage="Couldn't show this week's movers - try refreshing.">
              <WeeklyMovers data={weeklyMovers} />
            </ErrorBoundary>
          )}
          <label htmlFor="player-search" className="w-full max-w-xs">
            <span className="sr-only">Search by tag or name</span>
            <input
              id="player-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by tag or name..."
              className="w-full mb-3 px-3 py-1.5 rounded bg-gray-800 text-gray-100 placeholder-gray-500 border border-gray-600 focus:outline-none focus:border-indigo-400"
            />
          </label>
          {filteredPlayers && filteredPlayers.length === 0 ? (
            <div className="p-1 text-gray-400">{`No players match "${searchTerm}".`}</div>
          ) : (
            <ErrorBoundary fallbackMessage="Something went wrong showing the leaderboard table. This usually means Slippi changed their API again - try refreshing, or check back later.">
              <Table players={filteredPlayers || []} />
            </ErrorBoundary>
          )}
        </>
      )}
      <div className="p-4 text-gray-300 flex flex-col">
        <div>Built by blorppppp & Modified by C4D</div>
        <div>
          <a
            href="https://www.buymeacoffee.com/blorppppp"
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-indigo-700 mr-2 hover:underline"
          >
            Buy the original author a coffee
          </a>
          ☕
        </div>
        <div>
          <a
            href="https://www.buymeacoffee.com/costasford"
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-indigo-700 mr-2 hover:underline"
          >
            Buy C4D a coffee
          </a>
          ☕
        </div>
      </div>
    </div>
  );
}
