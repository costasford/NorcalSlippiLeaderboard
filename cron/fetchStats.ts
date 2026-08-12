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
  } catch (error) {
    console.error('Fatal error in main:', error);
    process.exitCode = 1;
  }
}

main();
