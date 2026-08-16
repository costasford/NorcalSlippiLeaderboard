const http = require('http');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const CONNECT_CODE_RE = /^[A-Z0-9]+#[0-9]+$/;
const MAX_FIELD_LENGTH = 200;
const MAX_BODY_BYTES = 5000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function setCorsHeaders(res, allowedOrigin) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, title, message) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>`
    + `<body style="font-family: sans-serif; max-width: 32rem; margin: 4rem auto; text-align: center;">`
    + `<h1>${title}</h1><p>${message}</p></body></html>`);
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

const base64url = (buffer) => buffer.toString('base64url');

// Signs {action, code, exp} into a compact, tamper-evident token so the
// Approve/Reject links in the Discord message can carry out (or discard) a
// specific request without any server-side session state. Anyone with the
// secret can forge one, but the secret never leaves the server - the token
// is only as sensitive as the private Discord channel it's posted into.
function signApprovalToken(secret, payload) {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifyApprovalToken(secret, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expectedSig = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
  } catch (error) {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  if (payload.action !== 'add' && payload.action !== 'remove') return null;
  if (!CONNECT_CODE_RE.test(payload.code || '')) return null;
  return payload;
}

async function readRoster(rosterPath) {
  try {
    return JSON.parse(await fs.readFile(rosterPath, 'utf-8'));
  } catch (error) {
    return { connectCodes: [], lastUpdated: '', description: 'Auto-created by tag-request-api.' };
  }
}

async function writeRoster(rosterPath, roster) {
  await fs.mkdir(path.dirname(rosterPath), { recursive: true });
  await fs.writeFile(rosterPath, JSON.stringify(roster, null, 2));
}

// Applies an approved add/remove to the shared roster file. Idempotent -
// approving the same token twice (e.g. a double click) is a harmless no-op
// the second time, which is what lets the token stay stateless rather than
// needing a "have we already used this one" store.
async function applyApproval(rosterPath, { action, code }) {
  const roster = await readRoster(rosterPath);
  const codes = new Set(roster.connectCodes || []);
  const hadCode = codes.has(code);
  if (action === 'add') codes.add(code);
  else codes.delete(code);

  const changed = action === 'add' ? !hadCode : hadCode;
  if (changed) {
    await writeRoster(rosterPath, {
      ...roster,
      connectCodes: [...codes],
      lastUpdated: new Date().toISOString(),
    });
  }
  return changed;
}

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
  approvalSecret = null,
  publicBaseUrl = null,
  rosterPath = path.join(__dirname, 'data', 'roster.json'),
}) {
  const isRateLimited = (ip) => {
    const now = Date.now();
    const recent = (requestLog.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    requestLog.set(ip, recent);
    return recent.length > MAX_REQUESTS_PER_WINDOW;
  };

  const buildApprovalComponents = (action, connectCode) => {
    if (!approvalSecret || !publicBaseUrl) return undefined;
    const token = signApprovalToken(approvalSecret, {
      action,
      code: connectCode,
      exp: Date.now() + APPROVAL_TOKEN_TTL_MS,
    });
    const approveUrl = `${publicBaseUrl}/tag-request/approve?token=${encodeURIComponent(token)}`;
    const rejectUrl = `${publicBaseUrl}/tag-request/reject?token=${encodeURIComponent(token)}`;
    return [{
      type: 1,
      components: [
        {
          type: 2, style: 5, label: 'Approve', url: approveUrl,
        },
        {
          type: 2, style: 5, label: 'Reject', url: rejectUrl,
        },
      ],
    }];
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
        body: JSON.stringify({
          content: lines.join('\n'),
          components: buildApprovalComponents(action, connectCode),
        }),
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

  const handleApprovalLink = async (req, res, { apply }) => {
    if (!approvalSecret) {
      sendHtml(res, 500, 'Not configured', 'Approval links are not enabled on this server.');
      return;
    }

    const { searchParams } = new URL(req.url, 'http://localhost');
    const payload = verifyApprovalToken(approvalSecret, searchParams.get('token'));
    if (!payload) {
      sendHtml(res, 400, 'Link expired or invalid', 'This approval link is no longer valid.');
      return;
    }

    if (!apply) {
      sendHtml(res, 200, 'Rejected', `No changes made for \`${payload.code}\`.`);
      return;
    }

    const changed = await applyApproval(rosterPath, payload);
    const verb = payload.action === 'add' ? 'added to' : 'removed from';
    const detail = changed
      ? `\`${payload.code}\` will be ${verb} the leaderboard within 8 minutes.`
      : `\`${payload.code}\` was already ${payload.action === 'add' ? 'on' : 'off'} the roster - no change needed.`;
    sendHtml(res, 200, 'Approved', detail);
  };

  return http.createServer(async (req, res) => {
    setCorsHeaders(res, allowedOrigin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/tag-request') {
      try {
        await handleTagRequest(req, res);
      } catch (error) {
        sendJson(res, 500, { error: 'Unexpected error.' });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/tag-request/approve') {
      try {
        await handleApprovalLink(req, res, { apply: true });
      } catch (error) {
        sendHtml(res, 500, 'Unexpected error', 'Something went wrong applying this request.');
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/tag-request/reject') {
      try {
        await handleApprovalLink(req, res, { apply: false });
      } catch (error) {
        sendHtml(res, 500, 'Unexpected error', 'Something went wrong processing this request.');
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  });
}

module.exports = {
  createServer, sanitizeForDiscord, CONNECT_CODE_RE, signApprovalToken, verifyApprovalToken,
};

if (require.main === module) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL is not set - refusing to start.');
    process.exit(1);
  }

  if (!process.env.APPROVAL_SECRET) {
    console.warn('APPROVAL_SECRET is not set - tag requests will be posted without Approve/Reject buttons.');
  }

  const port = process.env.PORT || 3001;
  const server = createServer({
    webhookUrl,
    allowedOrigin: process.env.ALLOWED_ORIGIN || 'https://costasford.github.io',
    approvalSecret: process.env.APPROVAL_SECRET || null,
    publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
    rosterPath: path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'roster.json'),
  });
  server.listen(port, () => {
    console.log(`tag-request-api listening on ${port}`);
  });
}
