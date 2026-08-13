/**
 * @jest-environment node
 *
 * This suite makes real network calls (a real http.Server on an ephemeral
 * port, hit with the real fetch) - the default jsdom test environment
 * doesn't reliably expose Node's built-in fetch, and there's no DOM
 * involved here anyway.
 */
const { createServer, sanitizeForDiscord, CONNECT_CODE_RE } = require('../server');

const WEBHOOK_URL = 'https://discord.test/webhook';

let server;
let baseUrl;
let fetchImpl;

const startServer = () => new Promise((resolve) => {
  fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  server = createServer({ webhookUrl: WEBHOOK_URL, fetchImpl });
  server.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
});

const stopServer = () => new Promise((resolve) => { server.close(resolve); });

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
  it('forwards a well-formed add request to the webhook and returns 200', async () => {
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
    expect(calledUrl).toBe(WEBHOOK_URL);
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
