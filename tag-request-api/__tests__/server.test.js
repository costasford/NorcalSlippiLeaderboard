/**
 * @jest-environment node
 *
 * This suite makes real network calls (a real http.Server on an ephemeral
 * port, hit with the real fetch) - the default jsdom test environment
 * doesn't reliably expose Node's built-in fetch, and there's no DOM
 * involved here anyway.
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  createServer, sanitizeForDiscord, CONNECT_CODE_RE, signApprovalToken, verifyApprovalToken,
} = require('../server');

const BOT_TOKEN = 'test-bot-token';
const CHANNEL_ID = '123456789';
const ANNOUNCE_CHANNEL_ID = '987654321';
const APPROVAL_SECRET = 'test-secret';
const PUBLIC_BASE_URL = 'https://tag-request.test';

let server;
let baseUrl;
let fetchImpl;
let rosterPath;

const startServer = (extraOpts = {}) => new Promise((resolve) => {
  fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  rosterPath = path.join(os.tmpdir(), `roster-test-${Date.now()}-${Math.random()}.json`);
  server = createServer({
    botToken: BOT_TOKEN, channelId: CHANNEL_ID, fetchImpl, rosterPath, ...extraOpts,
  });
  server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
});

const stopServer = () => new Promise((resolve) => {
  server.close(async () => {
    await fs.rm(rosterPath, { force: true });
    resolve();
  });
});

const postTagRequest = (body) => fetch(`${baseUrl}/tag-request`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(startServer);
afterEach(stopServer);

describe('sanitizeForDiscord', () => {
  it('breaks @everyone/@here mention parsing', () => {
    expect(sanitizeForDiscord('ping @everyone now')).not.toContain('@everyone');
    expect(sanitizeForDiscord('hey @here')).not.toContain('@here');
  });

  it('leaves text without mentions unchanged apart from the @ itself', () => {
    expect(sanitizeForDiscord('no mentions here')).toBe('no mentions here');
  });
});

describe('CONNECT_CODE_RE', () => {
  it.each(['ABCD#123', 'A#0', 'XYZ123#4567'])('accepts %s', (code) => {
    expect(CONNECT_CODE_RE.test(code)).toBe(true);
  });

  it.each(['abcd#123', 'ABCD123', 'ABCD#', '#123', ''])('rejects %s', (code) => {
    expect(CONNECT_CODE_RE.test(code)).toBe(false);
  });
});

describe('OPTIONS preflight', () => {
  it('responds 204 with CORS headers', async () => {
    const res = await fetch(`${baseUrl}/tag-request`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://costasford.github.io');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('unknown routes', () => {
  it('returns 404 for a GET request', async () => {
    const res = await fetch(`${baseUrl}/tag-request`, { method: 'GET' });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unrelated path', async () => {
    const res = await fetch(`${baseUrl}/nope`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('POST /tag-request validation', () => {
  it('rejects a missing/invalid action', async () => {
    const res = await postTagRequest({ action: 'delete', connectCode: 'ABCD#123' });
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an invalid connect code', async () => {
    const res = await postTagRequest({ action: 'add', connectCode: 'not a code' });
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body', async () => {
    const res = await fetch(`${baseUrl}/tag-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /tag-request success', () => {
  it('forwards a well-formed add request to the bot API and returns 200', async () => {
    const res = await postTagRequest({
      action: 'add',
      connectCode: 'abcd#123',
      displayName: 'Test Player',
      context: 'this is me',
    });

    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchImpl.mock.calls[0];
    expect(calledUrl).toBe(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`);
    expect(options.headers.authorization).toBe(`Bot ${BOT_TOKEN}`);
    const payload = JSON.parse(options.body);
    expect(payload.content).toContain('Add tag request');
    expect(payload.content).toContain('ABCD#123');
    expect(payload.content).toContain('Test Player');
    expect(payload.content).toContain('this is me');
  });

  it('uppercases the connect code regardless of input casing', async () => {
    await postTagRequest({ action: 'remove', connectCode: 'xyz#9' });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.content).toContain('XYZ#9');
    expect(payload.content).toContain('Remove tag request');
  });

  it('omits optional fields from the message when not provided', async () => {
    await postTagRequest({ action: 'add', connectCode: 'ABCD#123' });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.content).not.toContain('Name:');
    expect(payload.content).not.toContain('Context:');
  });

  it('neutralizes mention syntax in free-text fields before sending', async () => {
    await postTagRequest({
      action: 'add',
      connectCode: 'ABCD#123',
      displayName: '@everyone',
    });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.content).not.toContain('@everyone');
  });

  it('truncates overly long free-text fields', async () => {
    await postTagRequest({
      action: 'add',
      connectCode: 'ABCD#123',
      context: 'x'.repeat(500),
    });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const contextLine = payload.content.split('\n').find((l) => l.startsWith('Context:'));
    expect(contextLine.length).toBeLessThan(220);
  });
});

describe('POST /tag-request when Discord is unreachable', () => {
  it('returns 502 without leaking the underlying error', async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 500 });
    const res = await postTagRequest({ action: 'add', connectCode: 'ABCD#123' });
    expect(res.status).toBe(502);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit, then rejects further requests from the same client', async () => {
    const responses = [];
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < 7; i++) {
      // eslint-disable-next-line no-await-in-loop
      responses.push(await postTagRequest({ action: 'add', connectCode: 'ABCD#123' }));
    }
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});

describe('signApprovalToken / verifyApprovalToken', () => {
  it('round-trips a valid payload', () => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action: 'add', code: 'ABCD#123', exp: Date.now() + 1000,
    });
    expect(verifyApprovalToken(APPROVAL_SECRET, token)).toEqual(
      expect.objectContaining({ action: 'add', code: 'ABCD#123' }),
    );
  });

  it('rejects a token signed with a different secret', () => {
    const token = signApprovalToken('other-secret', {
      action: 'add', code: 'ABCD#123', exp: Date.now() + 1000,
    });
    expect(verifyApprovalToken(APPROVAL_SECRET, token)).toBeNull();
  });

  it('rejects a payload tampered with after signing', () => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action: 'add', code: 'ABCD#123', exp: Date.now() + 1000,
    });
    const [, sig] = token.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({
      action: 'add', code: 'EVIL#999', exp: Date.now() + 1000,
    })).toString('base64url');
    expect(verifyApprovalToken(APPROVAL_SECRET, `${tamperedBody}.${sig}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action: 'add', code: 'ABCD#123', exp: Date.now() - 1000,
    });
    expect(verifyApprovalToken(APPROVAL_SECRET, token)).toBeNull();
  });

  it('rejects a malformed or missing token', () => {
    expect(verifyApprovalToken(APPROVAL_SECRET, 'not-a-token')).toBeNull();
    expect(verifyApprovalToken(APPROVAL_SECRET, undefined)).toBeNull();
  });
});

describe('Discord message approval buttons', () => {
  it('omits components when APPROVAL_SECRET/PUBLIC_BASE_URL are not configured', async () => {
    await postTagRequest({ action: 'add', connectCode: 'ABCD#123' });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.components).toBeUndefined();
  });

  it('includes Approve/Reject link buttons when configured', async () => {
    await stopServer();
    await startServer({ approvalSecret: APPROVAL_SECRET, publicBaseUrl: PUBLIC_BASE_URL });

    await postTagRequest({ action: 'add', connectCode: 'ABCD#123' });
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);

    const buttons = payload.components[0].components;
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ label: 'Approve', style: 5 });
    expect(buttons[1]).toMatchObject({ label: 'Reject', style: 5 });
    expect(buttons[0].url).toContain(`${PUBLIC_BASE_URL}/tag-request/approve?token=`);
    expect(buttons[1].url).toContain(`${PUBLIC_BASE_URL}/tag-request/reject?token=`);
  });
});

describe('leaderboard announcement on approval', () => {
  beforeEach(async () => {
    await stopServer();
    await startServer({
      approvalSecret: APPROVAL_SECRET, publicBaseUrl: PUBLIC_BASE_URL, announceChannelId: ANNOUNCE_CHANNEL_ID,
    });
  });

  const approveLinkFor = (action, code, overrides = {}) => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action, code, exp: Date.now() + 1000, ...overrides,
    });
    return `${baseUrl}/tag-request/approve?token=${encodeURIComponent(token)}`;
  };

  it('posts an announcement to the announce channel when a code is newly added', async () => {
    await fetch(approveLinkFor('add', 'NEW#1'));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchImpl.mock.calls[0];
    expect(calledUrl).toBe(`https://discord.com/api/v10/channels/${ANNOUNCE_CHANNEL_ID}/messages`);
    expect(options.headers.authorization).toBe(`Bot ${BOT_TOKEN}`);
    const payload = JSON.parse(options.body);
    expect(payload.content).toContain('NEW#1');
    expect(payload.content).toContain('added to');
  });

  it('does not announce when the code was already on the roster (no-op approve)', async () => {
    const url = approveLinkFor('add', 'DUP#1');
    await fetch(url);
    fetchImpl.mockClear();
    await fetch(url);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not announce on reject', async () => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action: 'add', code: 'SKIP#1', exp: Date.now() + 1000,
    });
    await fetch(`${baseUrl}/tag-request/reject?token=${encodeURIComponent(token)}`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not announce when announceChannelId is not configured', async () => {
    await stopServer();
    await startServer({ approvalSecret: APPROVAL_SECRET, publicBaseUrl: PUBLIC_BASE_URL });
    await fetch(approveLinkFor('add', 'NEW#2'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still returns 200 to the user if the announcement post fails', async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 500 });
    const res = await fetch(approveLinkFor('add', 'NEW#3'));
    expect(res.status).toBe(200);
  });
});

describe('GET /tag-request/approve and /reject', () => {
  beforeEach(async () => {
    await stopServer();
    await startServer({ approvalSecret: APPROVAL_SECRET, publicBaseUrl: PUBLIC_BASE_URL });
  });

  const approveLinkFor = (action, code, overrides = {}) => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action, code, exp: Date.now() + 1000, ...overrides,
    });
    return `${baseUrl}/tag-request/approve?token=${encodeURIComponent(token)}`;
  };

  it('adds a connect code to a fresh roster on approve', async () => {
    const res = await fetch(approveLinkFor('add', 'NEW#1'));
    expect(res.status).toBe(200);
    const roster = JSON.parse(await fs.readFile(rosterPath, 'utf-8'));
    expect(roster.connectCodes).toContain('NEW#1');
  });

  it('is idempotent - approving the same add twice does not duplicate the code', async () => {
    const url = approveLinkFor('add', 'DUP#1');
    await fetch(url);
    await fetch(url);
    const roster = JSON.parse(await fs.readFile(rosterPath, 'utf-8'));
    expect(roster.connectCodes.filter((c) => c === 'DUP#1')).toHaveLength(1);
  });

  it('removes a connect code on approve', async () => {
    await fs.writeFile(rosterPath, JSON.stringify({ connectCodes: ['GONE#1', 'STAY#2'] }));
    const res = await fetch(approveLinkFor('remove', 'GONE#1'));
    expect(res.status).toBe(200);
    const roster = JSON.parse(await fs.readFile(rosterPath, 'utf-8'));
    expect(roster.connectCodes).toEqual(['STAY#2']);
  });

  it('removing an absent code is a harmless no-op', async () => {
    await fs.writeFile(rosterPath, JSON.stringify({ connectCodes: ['STAY#2'] }));
    const res = await fetch(approveLinkFor('remove', 'ABSENT#1'));
    expect(res.status).toBe(200);
    const roster = JSON.parse(await fs.readFile(rosterPath, 'utf-8'));
    expect(roster.connectCodes).toEqual(['STAY#2']);
  });

  it('rejects an expired token with 400 and makes no change', async () => {
    const res = await fetch(approveLinkFor('add', 'NOPE#1', { exp: Date.now() - 1000 }));
    expect(res.status).toBe(400);
    await expect(fs.access(rosterPath)).rejects.toThrow();
  });

  it('the reject link verifies the token but never touches the roster', async () => {
    const token = signApprovalToken(APPROVAL_SECRET, {
      action: 'add', code: 'SKIP#1', exp: Date.now() + 1000,
    });
    const res = await fetch(`${baseUrl}/tag-request/reject?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    await expect(fs.access(rosterPath)).rejects.toThrow();
  });

  it('returns 500 for approve links when approvals are not configured', async () => {
    await stopServer();
    await startServer();

    const token = signApprovalToken('irrelevant-since-unconfigured', {
      action: 'add', code: 'ABCD#123', exp: Date.now() + 1000,
    });
    const res = await fetch(`${baseUrl}/tag-request/approve?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(500);
  });
});
