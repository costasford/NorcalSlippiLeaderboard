import { getPlayerDataThrottled } from './slippi'
import * as syncFs from 'fs';
import * as path from 'path';

const fs = syncFs.promises;

interface PlayerConfig {
  connectCodes: string[];
  lastUpdated: string;
  description: string;
}

const getPlayerConnectCodes = async (): Promise<string[]> => {
  try {
    const configPath = path.join(__dirname, 'players.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config: PlayerConfig = JSON.parse(configData);

    // Validate connect code format (should be XXXX#YYY)
    const validCodes = config.connectCodes.filter(code => {
      const isValid = /^[A-Z0-9]+#[0-9]+$/.test(code);
      if (!isValid) {
        console.warn(`Invalid connect code format: ${code}`);
      }
      return isValid;
    });

    console.log(`Loaded ${validCodes.length} valid connect codes from config`);
    return validCodes;
  } catch (error) {
    console.error('Failed to load player config, falling back to empty array:', error);
    return [];
  }
};

const getPlayers = async () => {
  try {
    const codes = await getPlayerConnectCodes()
    if (codes.length === 0) {
      throw new Error('No valid connect codes found');
    }

    console.log(`Found ${codes.length} player codes`)
    const allData = codes.map(code => getPlayerDataThrottled(code))
    const results = await Promise.all(allData.map(p => p.catch(e => {
      console.error(`Failed to fetch data for player:`, e.message);
      return e;
    })));

    const validResults = results.filter(result => !(result instanceof Error));
    console.log(`Successfully fetched data for ${validResults.length}/${codes.length} players`);

    // getUser returns the User directly (no nested .user), and a valid
    // account may still have no rankedNetplayProfile if they haven't
    // played ranked this season - skip those rather than crash sorting.
    const unsortedPlayers = validResults
      .filter((data: any) => data?.data?.getUser?.rankedNetplayProfile)
      .map((data: any) => data.data.getUser);
    console.log(`${unsortedPlayers.length} of ${codes.length} codes returned ranked data`)

    return unsortedPlayers.sort((p1, p2) =>
      p2.rankedNetplayProfile.ratingOrdinal - p1.rankedNetplayProfile.ratingOrdinal)
  } catch (error) {
    console.error('Error in getPlayers:', error);
    throw error;
  }
}

interface HistorySnapshotEntry {
  code: string;
  name: string;
  rating: number;
}

const HISTORY_RETENTION_DAYS = 35;
const WEEKLY_MOVERS_TARGET_DAYS = 7;

const toSnapshot = (players: any[]): HistorySnapshotEntry[] => players
  .filter((p) => p?.rankedNetplayProfile)
  .map((p) => ({
    code: p.connectCode.code,
    name: p.displayName,
    rating: p.rankedNetplayProfile.ratingOrdinal,
  }));

// One snapshot per calendar day, kept for HISTORY_RETENTION_DAYS, so we can
// compare "now" against "about a week ago" for a biggest-movers view.
async function recordHistorySnapshot(historyDir: string, snapshot: HistorySnapshotEntry[]) {
  await fs.mkdir(historyDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const todayFile = path.join(historyDir, `${today}.json`);

  try {
    await fs.access(todayFile);
    console.log(`History snapshot for ${today} already exists, skipping.`);
  } catch {
    await fs.writeFile(todayFile, JSON.stringify(snapshot, null, 2));
    console.log(`Wrote history snapshot for ${today}.`);
  }

  const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = await fs.readdir(historyDir);
  await Promise.all(files.map(async (file) => {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) return;
    if (new Date(`${match[1]}T00:00:00Z`).getTime() < cutoff) {
      await fs.unlink(path.join(historyDir, file));
      console.log(`Pruned old history snapshot ${file}.`);
    }
  }));
}

// Compares the latest snapshot against the oldest one that's at least a
// week old (or the oldest we have, if less than a week of history exists
// yet) and writes the top gainers/losers for the frontend to show.
async function writeWeeklyMovers(dataDir: string, historyDir: string) {
  const files = (await fs.readdir(historyDir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  if (files.length < 2) {
    console.log('Not enough history yet for weekly movers.');
    return;
  }

  const latestFile = files[files.length - 1];
  const targetTime = Date.now() - WEEKLY_MOVERS_TARGET_DAYS * 24 * 60 * 60 * 1000;
  const comparisonFile = files.find(
    (f) => new Date(`${f.slice(0, 10)}T00:00:00Z`).getTime() <= targetTime,
  ) || files[0];

  if (comparisonFile === latestFile) {
    console.log('Only one history snapshot exists so far - skipping weekly movers.');
    return;
  }

  const [comparisonData, latestData]: [HistorySnapshotEntry[], HistorySnapshotEntry[]] = await Promise.all([
    fs.readFile(path.join(historyDir, comparisonFile), 'utf-8').then(JSON.parse),
    fs.readFile(path.join(historyDir, latestFile), 'utf-8').then(JSON.parse),
  ]);
  const comparisonMap = new Map(comparisonData.map((p) => [p.code, p]));

  const movers = latestData
    .filter((p) => comparisonMap.has(p.code))
    .map((p) => {
      const old = comparisonMap.get(p.code)!;
      return {
        code: p.code,
        name: p.name,
        oldRating: old.rating,
        newRating: p.rating,
        delta: Math.round((p.rating - old.rating) * 10) / 10,
      };
    })
    .sort((a, b) => b.delta - a.delta);

  // Slice from opposite ends so a small player pool never puts the same
  // person in both the gainers and losers lists.
  const gainers = movers.slice(0, 5);
  const losers = movers.slice(Math.max(5, movers.length - 5)).reverse();

  await fs.writeFile(
    path.join(dataDir, 'weekly-movers.json'),
    JSON.stringify({ comparisonDate: comparisonFile.replace('.json', ''), gainers, losers }, null, 2),
  );
  console.log(`Wrote weekly movers (comparing against ${comparisonFile}).`);
}

async function main() {
  try {
    console.log('Starting player fetch.');
    const players = await getPlayers();

    if(!players.length) {
      console.log('Error fetching player data. Terminating.')
      return
    }

    console.log('Player fetch complete.');

    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const currentFile = path.join(dataDir, 'players.json');
    const previousFile = path.join(dataDir, 'players-previous.json');
    const timestampFile = path.join(dataDir, 'timestamp.json');

    // Keep the last successful snapshot around so the frontend can show
    // rank movement between updates. Fine if there's no previous run yet.
    try {
      await fs.copyFile(currentFile, previousFile);
      console.log('Saved previous snapshot for rank-movement comparison.');
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      console.log('No existing data file yet - this must be the first run.');
    }

    await fs.writeFile(currentFile, JSON.stringify(players, null, 2));
    await fs.writeFile(timestampFile, JSON.stringify({ updated: Date.now() }, null, 2));
    console.log(`Wrote ${players.length} players to ${currentFile}`);

    const historyDir = path.join(dataDir, 'history');
    await recordHistorySnapshot(historyDir, toSnapshot(players));
    await writeWeeklyMovers(dataDir, historyDir);
  } catch (error) {
    console.error('Fatal error in main:', error);
    process.exitCode = 1;
  }
}

main();
