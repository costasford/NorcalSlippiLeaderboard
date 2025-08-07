import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime'; // import plugin
import { Table } from '../../Table';
import { Player } from '../../../lib/player';
import playersOld from '../../../../cron/data/players-old.json';
import playersNew from '../../../../cron/data/players-new.json';
import timestamp from '../../../../cron/data/timestamp.json';
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

export default function HomePage() {
  const rankedPlayersOld = sortAndPopulatePlayers(playersOld);
  const oldPlayersMap = new Map(
    rankedPlayersOld.map((p) => [p.connectCode.code, p]),
  );

  const players = sortAndPopulatePlayers(playersNew);
  players.forEach((currentPlayer) => {
    const modifiedPlayer = currentPlayer;
    const oldData = oldPlayersMap.get(modifiedPlayer.connectCode.code);
    if (oldData) {
      modifiedPlayer.oldRankedNetplayProfile = oldData.rankedNetplayProfile;
    }
  });

  // continuously update
  const updatedAt = dayjs(timestamp.updated);
  const [updateDesc, setUpdateDesc] = useState(updatedAt.fromNow());
  useEffect(() => {
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
      <div className="p-1 text-gray-300">
        {' '}
        Updated
        {updateDesc}
      </div>
      <Table players={players} />
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
