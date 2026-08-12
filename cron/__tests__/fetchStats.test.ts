import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { sync as rimrafSync } from 'rimraf';
import {
  toSnapshot,
  recordHistorySnapshot,
  writeWeeklyMovers,
  HISTORY_RETENTION_DAYS,
  WEEKLY_MOVERS_TARGET_DAYS,
} from '../fetchStats';

const daysAgoStr = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const mockPlayer = (code: string, name: string, rating: number) => ({
  displayName: name,
  connectCode: { code },
  rankedNetplayProfile: { ratingOrdinal: rating },
});

let tmpDir: string;
let dataDir: string;
let historyDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsl-fetchstats-'));
  dataDir = path.join(tmpDir, 'data');
  historyDir = path.join(dataDir, 'history');
  fs.mkdirSync(dataDir, { recursive: true });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  rimrafSync(tmpDir);
  jest.restoreAllMocks();
});

const writeHistoryFile = (dateStr: string, entries: unknown[]) => {
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(path.join(historyDir, `${dateStr}.json`), JSON.stringify(entries));
};

const readHistoryFile = (dateStr: string) => JSON.parse(
  fs.readFileSync(path.join(historyDir, `${dateStr}.json`), 'utf-8'),
);

const readWeeklyMovers = () => JSON.parse(
  fs.readFileSync(path.join(dataDir, 'weekly-movers.json'), 'utf-8'),
);

describe('toSnapshot', () => {
  it('maps players with a ranked profile to {code, name, rating}', () => {
    const players = [mockPlayer('ABCD#123', 'Someone', 1500.5)];
    expect(toSnapshot(players)).toEqual([
      { code: 'ABCD#123', name: 'Someone', rating: 1500.5 },
    ]);
  });

  it('drops players with no ranked profile instead of crashing', () => {
    const players = [
      mockPlayer('ABCD#123', 'Ranked', 1500),
      { displayName: 'Unranked', connectCode: { code: 'NONE#0' }, rankedNetplayProfile: null },
    ];
    expect(toSnapshot(players)).toEqual([
      { code: 'ABCD#123', name: 'Ranked', rating: 1500 },
    ]);
  });
});

describe('recordHistorySnapshot', () => {
  it('writes a snapshot file for today when none exists yet', async () => {
    const snapshot = [{ code: 'ABCD#123', name: 'Someone', rating: 1500 }];
    await recordHistorySnapshot(historyDir, snapshot);
    expect(readHistoryFile(daysAgoStr(0))).toEqual(snapshot);
  });

  it('does not overwrite an existing snapshot for today', async () => {
    const original = [{ code: 'ABCD#123', name: 'Someone', rating: 1500 }];
    await recordHistorySnapshot(historyDir, original);
    await recordHistorySnapshot(historyDir, [{ code: 'ZZZZ#0', name: 'Different', rating: 999 }]);
    expect(readHistoryFile(daysAgoStr(0))).toEqual(original);
  });

  it('prunes snapshots older than the retention window', async () => {
    const staleDate = daysAgoStr(HISTORY_RETENTION_DAYS + 5);
    writeHistoryFile(staleDate, [{ code: 'OLD#1', name: 'Old', rating: 1000 }]);

    await recordHistorySnapshot(historyDir, []);

    expect(fs.existsSync(path.join(historyDir, `${staleDate}.json`))).toBe(false);
  });

  it('keeps snapshots inside the retention window', async () => {
    const recentDate = daysAgoStr(HISTORY_RETENTION_DAYS - 5);
    writeHistoryFile(recentDate, [{ code: 'RECENT#1', name: 'Recent', rating: 1000 }]);

    await recordHistorySnapshot(historyDir, []);

    expect(fs.existsSync(path.join(historyDir, `${recentDate}.json`))).toBe(true);
  });
});

describe('writeWeeklyMovers', () => {
  it('does nothing when fewer than two history snapshots exist', async () => {
    writeHistoryFile(daysAgoStr(0), [{ code: 'A#1', name: 'A', rating: 1000 }]);

    await writeWeeklyMovers(dataDir, historyDir);

    expect(fs.existsSync(path.join(dataDir, 'weekly-movers.json'))).toBe(false);
  });

  it('does nothing when only one distinct day of history exists', async () => {
    // Guards against comparing a snapshot against itself.
    writeHistoryFile(daysAgoStr(0), [{ code: 'A#1', name: 'A', rating: 1000 }]);
    writeHistoryFile(daysAgoStr(0), [{ code: 'A#1', name: 'A', rating: 1000 }]);

    await writeWeeklyMovers(dataDir, historyDir);

    expect(fs.existsSync(path.join(dataDir, 'weekly-movers.json'))).toBe(false);
  });

  it('compares against the oldest snapshot at least a week old', async () => {
    const oldDate = daysAgoStr(WEEKLY_MOVERS_TARGET_DAYS + 3);
    const midDate = daysAgoStr(WEEKLY_MOVERS_TARGET_DAYS - 1);
    const newDate = daysAgoStr(0);

    // Pad the pool past 10 players so gainers/losers don't collapse into
    // the same "everyone's a mover" bucket the small-pool guard uses.
    const flatPlayers = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      code: `FLAT#${i}`,
      name: `Flat${i}`,
      rating: 1000,
    }));

    writeHistoryFile(oldDate, [
      { code: 'GAIN#1', name: 'Gainer', rating: 1000 },
      { code: 'LOSE#1', name: 'Loser', rating: 1000 },
      ...flatPlayers,
    ]);
    // Should be ignored as the comparison point - it's newer than the
    // target window, so the older snapshot should win.
    writeHistoryFile(midDate, [
      { code: 'GAIN#1', name: 'Gainer', rating: 1900 },
      { code: 'LOSE#1', name: 'Loser', rating: 1100 },
      ...flatPlayers,
    ]);
    writeHistoryFile(newDate, [
      { code: 'GAIN#1', name: 'Gainer', rating: 1100 },
      { code: 'LOSE#1', name: 'Loser', rating: 900 },
      ...flatPlayers,
    ]);

    await writeWeeklyMovers(dataDir, historyDir);

    const movers = readWeeklyMovers();
    expect(movers.comparisonDate).toBe(oldDate);
    expect(movers.gainers[0]).toMatchObject({ code: 'GAIN#1', delta: 100 });
    expect(movers.losers[0]).toMatchObject({ code: 'LOSE#1', delta: -100 });
  });

  it('picks the qualifying snapshot closest to a week old, not the oldest retained one', async () => {
    const monthOld = daysAgoStr(20);
    const aboutAWeekOld = daysAgoStr(WEEKLY_MOVERS_TARGET_DAYS + 1);
    const today = daysAgoStr(0);

    writeHistoryFile(monthOld, [{ code: 'A#1', name: 'A', rating: 1000 }]);
    writeHistoryFile(aboutAWeekOld, [{ code: 'A#1', name: 'A', rating: 1000 }]);
    writeHistoryFile(today, [{ code: 'A#1', name: 'A', rating: 1050 }]);

    await writeWeeklyMovers(dataDir, historyDir);

    // Both monthOld and aboutAWeekOld satisfy "at least a week old" - the
    // comparison should use the more recent of the two, keeping the
    // window near a week instead of drifting toward full retention.
    expect(readWeeklyMovers().comparisonDate).toBe(aboutAWeekOld);
  });

  it('falls back to the oldest available snapshot when none is a week old yet', async () => {
    const day1 = daysAgoStr(2);
    const day2 = daysAgoStr(0);

    writeHistoryFile(day1, [{ code: 'A#1', name: 'A', rating: 1000 }]);
    writeHistoryFile(day2, [{ code: 'A#1', name: 'A', rating: 1050 }]);

    await writeWeeklyMovers(dataDir, historyDir);

    const movers = readWeeklyMovers();
    expect(movers.comparisonDate).toBe(day1);
    expect(movers.gainers[0]).toMatchObject({ code: 'A#1', delta: 50 });
  });

  it('only includes players present in both snapshots', async () => {
    const oldDate = daysAgoStr(10);
    const newDate = daysAgoStr(0);

    writeHistoryFile(oldDate, [{ code: 'STAYED#1', name: 'Stayed', rating: 1000 }]);
    writeHistoryFile(newDate, [
      { code: 'STAYED#1', name: 'Stayed', rating: 1050 },
      { code: 'BRANDNEW#1', name: 'New player', rating: 1500 },
    ]);

    await writeWeeklyMovers(dataDir, historyDir);

    const movers = readWeeklyMovers();
    const allCodes = [...movers.gainers, ...movers.losers].map((m: { code: string }) => m.code);
    expect(allCodes).toEqual(['STAYED#1']);
  });

  it('keeps gainers and losers from overlapping in a small player pool', async () => {
    const oldDate = daysAgoStr(10);
    const newDate = daysAgoStr(0);
    const oldSnapshot = [1, 2, 3].map((i) => ({ code: `P${i}#0`, name: `P${i}`, rating: 1000 }));
    const newSnapshot = [1, 2, 3].map((i) => ({ code: `P${i}#0`, name: `P${i}`, rating: 1000 + i * 10 }));

    writeHistoryFile(oldDate, oldSnapshot);
    writeHistoryFile(newDate, newSnapshot);

    await writeWeeklyMovers(dataDir, historyDir);

    const movers = readWeeklyMovers();
    const gainerCodes = movers.gainers.map((m: { code: string }) => m.code);
    const loserCodes = movers.losers.map((m: { code: string }) => m.code);
    expect(gainerCodes.filter((c: string) => loserCodes.includes(c))).toHaveLength(0);
  });
});
