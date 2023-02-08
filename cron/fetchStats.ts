import { getPlayerDataThrottled } from './slippi'
import * as syncFs from 'fs';
import * as path from 'path';
import util from 'util';
import * as settings from '../settings'

import { exec } from 'child_process';
const fs = syncFs.promises;
const execPromise = util.promisify(exec);

const getPlayerConnectCodes = async (): Promise<string[]> => { 
	return ['C4D#69','DUFF#838','YBAI#170','NATE#925','BLRG#257','BO#80','UMAR#289','AS#656','IRON#446','VIAL#2','JACK#925','SF#0','MSZ#006','CAT#614','SNAP#1','ARCA#521','TM#42','PENG#444','IBS#20','DUSKY#96','BRO#0','GRIF#526','PHRX#0','AWAE#209','DENZ#432','HIRO#702','XDXD#579','SFAT#9','DASH#909','GGG#366','DAHONG#8','CALP#463','DCCD#590','MAYBE#0','VYGR#415','LARS#342','OWEN#256','ITLY#654','CHAD#543','GOTH#666','RUSS#204','KB#795','JNOD#789','RP#263','POOP#733','B#0','BOT#0','BEZE#579','FRAC#575','MRG#172','WRXJ#644','ETRO#892','ZMLZ#826','WALL#142','ARCA#349','JAX#124','TRUE#768','JOEY#312','MM#391','BOND#007','LEJF#640','BAGE#751','BIO#324','QUIK#330','SWAN#349','KIM#4','TURT#785','ELFL#359','KWAN#900','ROWF#148','FUZZ#987','ELKG#852','CKIE#711','BDSH#255','SMUS#707','INDI#794','TUAR#403','YAMS#920','LIU#322','FREE#195','MOJ#383','PREY#969','DONG#323','LUNK#783','BISCUI#0','XXBO#793','COSTA#128','GING#402','COZT#129','SALT#820','KIKI#275','DARK#549','LOL#504','VESPER#0','SAMU#872','ZEBM#278','MARTH#1','SORY#336','ZATO#596','KK#12','JAYS#272','COOL#518','SPIFF#464','WOOP#287','KNOT#766','NSHI#997','CUCK#845','IMOO#924','SENS#116','SEAM#534','STC#498','CON#494','LANA#69','FN#168','NINT#859','FUD#982','IOWN#999','WICK#420','RAIN#119','HOBRO#0','VRAM#150','SUP#568','ARMN#253','SSJ#998','RAWR#836','AERI#564','ZF#909','WALC#0'] };

const getPlayers = async () => {
  const codes = await getPlayerConnectCodes()
  console.log(`Found ${codes.length} player codes`)
  const allData = codes.map(code => getPlayerDataThrottled(code))
  const results = await Promise.all(allData.map(p => p.catch(e => e)));
  const validResults = results.filter(result => !(result instanceof Error));
  const unsortedPlayers = validResults
    .filter((data: any) => data?.data?.getConnectCode?.user)
    .map((data: any) => data.data.getConnectCode.user);
  return unsortedPlayers.sort((p1, p2) =>
    p2.rankedNetplayProfile.ratingOrdinal - p1.rankedNetplayProfile.ratingOrdinal)
}

async function main() {
  console.log('Starting player fetch.');
  const players = await getPlayers();
  if(!players.length) {
    console.log('Error fetching player data. Terminating.')
    return
  }
  console.log('Player fetch complete.');
  // rename original to players-old
  const newFile = path.join(__dirname, 'data/players-new.json')
  const oldFile = path.join(__dirname, 'data/players-old.json')
  const timestamp = path.join(__dirname, 'data/timestamp.json')

  await fs.rename(newFile, oldFile)
  console.log('Renamed existing data file.');
  await fs.writeFile(newFile, JSON.stringify(players));
  await fs.writeFile(timestamp, JSON.stringify({updated: Date.now()}));
  console.log('Wrote new data file and timestamp.');
  const rootDir = path.normalize(path.join(__dirname, '..'))
  console.log(rootDir)
  // if no current git changes
  const { stdout, stderr } = await execPromise(`git -C ${rootDir} status --porcelain`);
  if(stdout || stderr) {
    console.log('Pending git changes... aborting deploy');
    return
  }
  console.log('Deploying.');
  const { stdout: stdout2, stderr: stderr2 } = await execPromise(`npm run --prefix ${rootDir} deploy`);
  console.log(stdout2);
  if(stderr2) {
    console.error(stderr2);
  }
  console.log('Deploy complete.');
}

main();
