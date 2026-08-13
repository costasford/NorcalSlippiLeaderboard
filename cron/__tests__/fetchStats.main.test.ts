import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { sync as rimrafSync } from 'rimraf';
import { getPlayerDataThrottled } from '../slippi';
import { main } from '../fetchStats';

jest.mock('../slippi', () => ({
  getPlayerDataThrottled: jest.fn(),
}));

const getPlayerDataThrottledMock = getPlayerDataThrottled as jest.Mock;

const playerConfig = (connectCodes: string[]) => JSON.stringify({
  connectCodes,
  lastUpdated: '2026-01-01',
  description: 'test config',
});

let tmpDir: string;
let dataDir: string;
let connectCodesJson: string;

// getPlayerConnectCodes reads a hardcoded cron/players.json path we can't
// inject a directory for, so this only fakes that one read (by path
// suffix) and lets every other fs.promises.readFile call - including the
// real ones main() makes via recordHistorySnapshot/writeWeeklyMovers -
// hit the real filesystem in a throwaway temp dir.
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsl-main-'));
  dataDir = path.join(tmpDir, 'data');
  process.env.DATA_DIR = dataDir;
  connectCodesJson = playerConfig(['ABCD#123']);

  const realReadFile = fs.promises.readFile.bind(fs.promises);
  jest.spyOn(fs.promises, 'readFile').mockImplementation(((filePath: fs.PathLike, ...rest: unknown[]) => {
    if (typeof filePath === 'string' && filePath.endsWith('players.json') && !filePath.startsWith(dataDir)) {
      return Promise.resolve(connectCodesJson);
    }
    return (realReadFile as (...args: unknown[]) => Promise<unknown>)(filePath, ...rest);
  }) as typeof fs.promises.readFile);

  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  delete process.env.DATA_DIR;
  rimrafSync(tmpDir);
  jest.restoreAllMocks();
  process.exitCode = undefined;
});

const readJson = (...parts: string[]) => JSON.parse(fs.readFileSync(path.join(dataDir, ...parts), 'utf-8'));

describe('main', () => {
  it('writes players.json and timestamp.json on a successful run', async () => {
    getPlayerDataThrottledMock.mockResolvedValue({
      data: {
        getUser: {
          displayName: 'Someone', connectCode: { code: 'ABCD#123' }, rankedNetplayProfile: { ratingOrdinal: 1500 },
        },
      },
    });

    await main();

    expect(readJson('players.json')).toHaveLength(1);
    expect(readJson('timestamp.json').updated).toEqual(expect.any(Number));
    expect(fs.existsSync(path.join(dataDir, 'players-previous.json'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('creates players-previous.json from a prior run on the next run', async () => {
    getPlayerDataThrottledMock.mockResolvedValue({
      data: {
        getUser: {
          displayName: 'Someone', connectCode: { code: 'ABCD#123' }, rankedNetplayProfile: { ratingOrdinal: 1500 },
        },
      },
    });

    await main();
    await main();

    expect(readJson('players-previous.json')).toEqual(readJson('players.json'));
  });

  it('does not write players.json when no configured player has ranked data', async () => {
    getPlayerDataThrottledMock.mockResolvedValue({
      data: { getUser: { displayName: 'Someone', connectCode: { code: 'ABCD#123' }, rankedNetplayProfile: null } },
    });

    await main();

    expect(fs.existsSync(path.join(dataDir, 'players.json'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('sets a non-zero exit code and writes nothing when there are no valid connect codes', async () => {
    connectCodesJson = playerConfig([]);

    await main();

    expect(fs.existsSync(dataDir)).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
