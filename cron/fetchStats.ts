import { getPlayerDataThrottled } from './slippi'
import * as syncFs from 'fs';
import * as path from 'path';
import util from 'util';
import * as settings from '../settings'

import { exec } from 'child_process';
const fs = syncFs.promises;
const execPromise = util.promisify(exec);

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
    
    const unsortedPlayers = validResults
      .filter((data: any) => data?.data?.getConnectCode?.user)
      .map((data: any) => data.data.getConnectCode.user);
      
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
    
    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    // rename original to players-old
    const newFile = path.join(dataDir, 'players-new.json')
    const oldFile = path.join(dataDir, 'players-old.json')
    const timestamp = path.join(dataDir, 'timestamp.json')

    try {
      await fs.rename(newFile, oldFile)
      console.log('Renamed existing data file.');
    } catch (error) {
      console.log('No existing data file to rename, creating new one.');
    }
    
    await fs.writeFile(newFile, JSON.stringify(players, null, 2));
    await fs.writeFile(timestamp, JSON.stringify({updated: Date.now()}, null, 2));
    console.log('Wrote new data file and timestamp.');
    
    const rootDir = path.normalize(path.join(__dirname, '..'))
    console.log('Root directory:', rootDir)
    
    // Check for git changes with proper error handling
    try {
      const { stdout, stderr } = await execPromise(`git -C "${rootDir}" status --porcelain`);
      if(stdout || stderr) {
        console.log('Pending git changes... aborting deploy');
        console.log('Changes:', stdout);
        return
      }
    } catch (error) {
      console.error('Git status check failed:', error);
      return;
    }
    
    console.log('Deploying.');
    try {
      const { stdout: stdout2, stderr: stderr2 } = await execPromise(`npm run --prefix "${rootDir}" deploy`);
      console.log('Deploy output:', stdout2);
      if(stderr2) {
        console.error('Deploy stderr:', stderr2);
      }
      console.log('Deploy complete.');
    } catch (error) {
      console.error('Deploy failed:', error);
    }
    
  } catch (error) {
    console.error('Fatal error in main:', error);
    process.exit(1);
  }
}

main();