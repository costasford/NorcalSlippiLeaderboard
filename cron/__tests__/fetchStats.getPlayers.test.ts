import * as fs from 'fs';
import { getPlayerDataThrottled } from '../slippi';
import { getPlayerConnectCodes, getPlayers } from '../fetchStats';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../slippi', () => ({
  getPlayerDataThrottled: jest.fn(),
}));

const readFileMock = fs.promises.readFile as jest.Mock;
const getPlayerDataThrottledMock = getPlayerDataThrottled as jest.Mock;

const playerConfig = (connectCodes: string[]) => JSON.stringify({
  connectCodes,
  lastUpdated: '2026-01-01',
  description: 'test config',
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getPlayerConnectCodes', () => {
  it('returns valid connect codes from the config file', async () => {
    readFileMock.mockResolvedValue(playerConfig(['ABCD#123', 'WXYZ#0']));
    expect(await getPlayerConnectCodes()).toEqual(['ABCD#123', 'WXYZ#0']);
  });

  it('filters out malformed connect codes', async () => {
    readFileMock.mockResolvedValue(
      playerConfig(['ABCD#123', 'not-a-code', 'lowercase#5', 'NOHASH123']),
    );
    expect(await getPlayerConnectCodes()).toEqual(['ABCD#123']);
  });

  it('returns an empty array if the config file cannot be read', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    expect(await getPlayerConnectCodes()).toEqual([]);
  });

  it('returns an empty array if the config file has invalid JSON', async () => {
    readFileMock.mockResolvedValue('not valid json');
    expect(await getPlayerConnectCodes()).toEqual([]);
  });
});

const playerResponse = (code: string, name: string, rating: number | null) => ({
  data: {
    getUser: {
      displayName: name,
      connectCode: { code },
      rankedNetplayProfile: rating === null ? null : { ratingOrdinal: rating },
    },
  },
});

describe('getPlayers', () => {
  it('throws when no valid connect codes are configured', async () => {
    readFileMock.mockResolvedValue(playerConfig([]));
    await expect(getPlayers()).rejects.toThrow('No valid connect codes found');
  });

  it('sorts fetched players by rating descending and drops unranked ones', async () => {
    readFileMock.mockResolvedValue(playerConfig(['LOW#1', 'HIGH#2', 'UNRANKED#3']));
    const responses: Record<string, unknown> = {
      'LOW#1': playerResponse('LOW#1', 'Low', 1000),
      'HIGH#2': playerResponse('HIGH#2', 'High', 2000),
      'UNRANKED#3': playerResponse('UNRANKED#3', 'Unranked', null),
    };
    getPlayerDataThrottledMock.mockImplementation(
      (code: string) => Promise.resolve(responses[code]),
    );

    const players = await getPlayers();

    expect(players.map((p) => p.displayName)).toEqual(['High', 'Low']);
  });

  it('skips players whose fetch fails without failing the whole batch', async () => {
    readFileMock.mockResolvedValue(playerConfig(['OK#1', 'BROKEN#2']));
    getPlayerDataThrottledMock.mockImplementation((code: string) => {
      if (code === 'BROKEN#2') return Promise.reject(new Error('network error'));
      return Promise.resolve(playerResponse('OK#1', 'Ok', 1500));
    });

    const players = await getPlayers();

    expect(players.map((p) => p.displayName)).toEqual(['Ok']);
  });
});
