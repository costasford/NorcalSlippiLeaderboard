import React from 'react';

interface Mover {
  code: string;
  name: string;
  oldRating: number;
  newRating: number;
  delta: number;
}

export interface WeeklyMoversData {
  comparisonDate: string;
  gainers: Mover[];
  losers: Mover[];
}

interface Props {
  data: WeeklyMoversData;
}

const codeToId = (code: string) => {
  const parts = code.split('#');
  return `${parts[0].toLowerCase()}-${parts[1]}`;
};

const codeToUrlSlug = (code: string) => `https://slippi.gg/user/${codeToId(code)}`;

function MoverList({ movers, positive }: { movers: Mover[]; positive: boolean }) {
  if (!movers.length) {
    return <div className="text-gray-400 text-sm">Not enough data yet.</div>;
  }
  return (
    <ol className="text-sm">
      {movers.map((m) => (
        <li key={m.code} className="flex justify-between gap-4 py-0.5">
          <a
            className="text-gray-300 hover:text-gray-500 hover:underline truncate"
            href={codeToUrlSlug(m.code)}
            target="_blank"
            rel="noreferrer"
          >
            {m.name}
          </a>
          <span className={positive ? 'text-green-500' : 'text-red-500'}>
            {positive ? '+' : ''}
            {Math.round(m.delta)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WeeklyMovers({ data }: Props) {
  return (
    <div className="w-full max-w-2xl mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300">
      <div className="bg-gray-800 bg-opacity-50 rounded p-3">
        <div className="text-xs uppercase text-gray-400 mb-1">Biggest gainers this week</div>
        <MoverList movers={data.gainers} positive />
      </div>
      <div className="bg-gray-800 bg-opacity-50 rounded p-3">
        <div className="text-xs uppercase text-gray-400 mb-1">Biggest losers this week</div>
        <MoverList movers={data.losers} positive={false} />
      </div>
    </div>
  );
}
