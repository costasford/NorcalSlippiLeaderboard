const removeTokensMock = jest.fn().mockResolvedValue(1);

jest.mock('limiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => ({
    removeTokens: removeTokensMock,
  })),
}));

// eslint-disable-next-line import/first
import { getPlayerData, getPlayerDataThrottled } from '../slippi';

const mockFetchResponse = { data: { getUser: { displayName: 'Test' } } };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve(mockFetchResponse),
  }) as unknown as typeof fetch;
});

describe('getPlayerData', () => {
  it('POSTs a GraphQL query to the Slippi API with the connect code as both cc and uid', async () => {
    await getPlayerData('ABCD#123');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://internal.slippi.gg/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.operationName).toBe('UserProfilePageQuery');
    expect(body.variables).toEqual({ cc: 'ABCD#123', uid: 'ABCD#123' });
  });

  it('returns the parsed JSON response', async () => {
    expect(await getPlayerData('ABCD#123')).toEqual(mockFetchResponse);
  });
});

describe('getPlayerDataThrottled', () => {
  it('removes a rate-limit token before fetching', async () => {
    await getPlayerDataThrottled('ABCD#123');
    expect(removeTokensMock).toHaveBeenCalledWith(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns the same data as an unthrottled call', async () => {
    expect(await getPlayerDataThrottled('ABCD#123')).toEqual(mockFetchResponse);
  });
});
