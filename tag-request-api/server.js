const http = require('http');

const CONNECT_CODE_RE = /^[A-Z0-9]+#[0-9]+$/;
const MAX_FIELD_LENGTH = 200;
const MAX_BODY_BYTES = 5000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function setCorsHeaders(res, allowedOrigin) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

// Breaks @everyone/@here/role/user mention parsing without otherwise
// mangling the text, so free-text fields can't be used to ping a server.
const sanitizeForDiscord = (value) => value.replace(/@/g, '@​');

/**
 * Builds a Node http.Server for the tag-request endpoint.
 * Exported as a factory (rather than a single top-level server instance)
 * so it can be constructed with test doubles - a fake fetchImpl and an
 * isolated rate-limit map - without needing a real Discord webhook or
 * bleeding rate-limit state between test cases.
 */
function createServer({
  webhookUrl,
  allowedOrigin = 'https://costasford.github.io',
  fetchImpl = fetch,
  requestLog = new Map(),
}) {
  const isRateLimited = (ip) => {
    const now = Date.now();
    const recent = (requestLog.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    requestLog.set(ip, recent);
    return recent.length > MAX_REQUESTS_PER_WINDOW;
  };

  const handleTagRequest = async (req, res) => {
    const ip = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
      return;
    }

    let body;
    try {
      body = JSON.parse(await readBody(req, MAX_BODY_BYTES));
    } catch (error) {
      sendJson(res, 400, { error: 'Invalid request body.' });
      return;
    }

    let action = null;
    if (body.action === 'add' || body.action === 'remove') {
      action = body.action;
    }
    const connectCode = typeof body.connectCode === 'string'
      ? body.connectCode.trim().toUpperCase()
      : '';
    const displayName = sanitizeForDiscord(truncate(body.displayName, MAX_FIELD_LENGTH).trim());
    const context = sanitizeForDiscord(truncate(body.context, MAX_FIELD_LENGTH).trim());

    if (!action || !CONNECT_CODE_RE.test(connectCode)) {
      sendJson(res, 400, { error: 'A valid action and connect code (e.g. ABCD#123) are required.' });
      return;
    }

    const lines = [
      `**${action === 'add' ? 'Add' : 'Remove'} tag request**`,
      `Connect code: \`${connectCode}\``,
    ];
    if (displayName) lines.push(`Name: ${displayName}`);
    if (context) lines.push(`Context: ${context}`);

    try {
      const discordRes = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: lines.join('\n') }),
      });
      if (!discordRes.ok) {
        throw new Error(`Discord responded ${discordRes.status}`);
      }
    } catch (error) {
      sendJson(res, 502, { error: 'Could not deliver the request right now. Please try again later.' });
      return;
    }

    sendJson(res, 200, { ok: true });
  };

  return http.createServer(async (req, res) => {
    setCorsHeaders(res, allowedOrigin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/tag-request') {
      try {
        await handleTagRequest(req, res);
      } catch (error) {
        sendJson(res, 500, { error: 'Unexpected error.' });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  });
}

module.exports = { createServer, sanitizeForDiscord, CONNECT_CODE_RE };

if (require.main === module) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL is not set - refusing to start.');
    process.exit(1);
  }

  const port = process.env.PORT || 3001;
  const server = createServer({
    webhookUrl,
    allowedOrigin: process.env.ALLOWED_ORIGIN || 'https://costasford.github.io',
  });
  server.listen(port, () => {
    console.log(`tag-request-api listening on ${port}`);
  });
}
