import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime'; // import plugin
import { Table } from '../../Table';
import { Player } from '../../../lib/player';
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

// players-previous.json won't exist yet on a brand new deployment - that's
// fine, it just means no rank-movement data is shown until the second run.
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

  useEffect(() => {
    const load = async () => {
      try {
        const base = settings.dataBaseUrl;
        const [playersNew, playersOld, timestamp] = await Promise.all([
          fetchJson(`${base}/players.json`),
          fetchJson(`${base}/players-previous.json`),
          fetchJson(`${base}/timestamp.json`),
        ]);

        if (!playersNew) {
          setError(true);
          return;
        }

        const rankedPlayersOld = sortAndPopulatePlayers(playersOld || []);
        const oldPlayersMap = new Map(
          rankedPlayersOld.map((p) => [p.connectCode.code, p]),
        );

        const rankedPlayers = sortAndPopulatePlayers(playersNew);
        rankedPlayers.forEach((currentPlayer) => {
          const modifiedPlayer = currentPlayer;
          const oldData = oldPlayersMap.get(modifiedPlayer.connectCode.code);
          if (oldData) {
            modifiedPlayer.oldRankedNetplayProfile = oldData.rankedNetplayProfile;
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
            {' '}
            Updated
            {updateDesc}
          </div>
          <Table players={players} />
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
            Buy me a coffee
          </a>
          ☕
        </div>
      </div>
    </div>
  );
}
