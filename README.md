# Norcal Ranked Slippi Leaderboard

[![CI](https://github.com/costasford/NorcalSlippiLeaderboard/actions/workflows/ci.yml/badge.svg)](https://github.com/costasford/NorcalSlippiLeaderboard/actions/workflows/ci.yml)

Code powering https://costasford.github.io/NorcalSlippiLeaderboard/#/

A live leaderboard of NorCal Melee players' Slippi ranked stats, sorted by rating.

Fork of [Grantismo/CoSlippiLeaderboard](https://github.com/Grantismo/CoSlippiLeaderboard), itself built on [react-pages-boilerplate](https://github.com/rtivital/react-pages-boilerplate).

## Features

- **Live rankings** — rank, rating, and character usage breakdown for every tracked player
- **Search** — filter the leaderboard by connect code or player name
- **Weekly movers** — biggest rating gainers and fallers over the past week, computed from the daily history snapshots `cron/` writes
- **Tag requests** — add/remove requests via an on-site form (see below) or a GitHub Issue, no account required either way
- **Graceful failure handling** — an error boundary keeps a bad player record or a Slippi API hiccup from taking down the whole page

## How it works

Three independent pieces:

- **[`src/`](./src)** — a static React site, deployed to GitHub Pages. It fetches the current leaderboard data at *runtime* rather than having it baked into the build, so the site only needs redeploying when the code actually changes.
- **[`cron/`](./cron)** — a small containerized job that fetches every player's current stats from Slippi's API, sorts them, and writes the result as JSON. It runs on a small always-on VPS via Docker Compose, on a loop (currently every 8 minutes — a nod to Melee's standard stock timer), and doesn't touch git or rebuild the site at all.
- **[`tag-request-api/`](./tag-request-api)** — a tiny containerized HTTP service on the same VPS that receives tag add/remove requests from the site's form and forwards them to a private Discord channel, so requesting a tag doesn't require a GitHub account.

A reverse proxy (Caddy) on that same VPS serves the JSON over HTTPS, and `settings.js`'s `dataBaseUrl` tells the frontend where to fetch it from.

This is a meaningfully different architecture than the original fork: the old version had the cron job git-commit its output and trigger a full site rebuild + redeploy on every run, from a personal machine. That's fragile (one uncommitted change on that machine and deploys silently stop) and heavy (a full site rebuild every few minutes forever). Splitting "data" from "site" means the data updates independently and the site only needs touching for real changes.

## Tech stack

- TypeScript
- [Webpack 5](https://webpack.js.org/) as the module bundler
- [ESLint](https://eslint.org/) for linting
- [Tailwind](https://tailwindcss.com/) for CSS
- Docker Compose for the cron job

## Requesting a tag be added or removed

Click **"Request a tag be added or removed"** on the site itself — it expands into a small form (no GitHub account needed) that posts straight to a private Discord channel via [`tag-request-api/`](./tag-request-api). A [GitHub Issue](https://github.com/costasford/NorcalSlippiLeaderboard/issues/new?template=tag-request.yml) link is still offered alongside it for people who'd rather use that. Either way, a human still reviews every request, but approving one is now a single click: the Discord message carries **Approve**/**Reject** buttons (see [Running the tag-request API](#running-the-tag-request-api)), and clicking Approve writes straight to the shared roster - no manual file edit or redeploy needed.

## Local development

```bash
npm install
npm start          # dev server at http://localhost:8262
npm run build       # production build to dist/
npm run deploy      # build + deploy to GitHub Pages
npm run lint
npm run typecheck
npm test
```

To point your local dev build at a different data source (e.g. while testing), edit `dataBaseUrl` in [`settings.js`](./settings.js).

## Running the data-fetch cron job

The player list is a flat array of Slippi connect codes (`connectCodes`), stored as `roster.json` in `DATA_DIR` (the same volume the fetch output is written to) rather than baked into the image - that's what lets the tag-request approval flow (see below) edit it live. [`cron/players.json`](./cron/players.json) is only the *default* list, copied into `DATA_DIR/roster.json` the first time the job runs against an empty volume. To add or remove players directly (rather than going through a tag request), edit `roster.json` in the volume - editing `cron/players.json` after that first run has no effect until the volume is wiped.

### Run it once, locally

```bash
npm install
DATA_DIR=./cron/data node -r ts-node/register cron/fetchStats.ts
```

This fetches every code in `cron/players.json` from Slippi's API (rate-limited to 1 request/second — please don't remove that, Slippi's API is undocumented and unofficial, and hammering it risks it getting locked down for everyone) and writes `players.json`, `players-previous.json`, and `timestamp.json` to `DATA_DIR`.

### Run it continuously (how the live site does it)

```bash
docker volume create leaderboard_data
docker compose up -d --build
```

This builds `cron/Dockerfile` and runs `cron/loop.sh`, which fetches on a loop and writes to the `leaderboard_data` Docker volume. Whatever serves your frontend needs to expose that volume's `players.json` / `players-previous.json` / `timestamp.json` over HTTP (with CORS allowing your frontend's origin) at the URL configured in `settings.js`'s `dataBaseUrl` — the live deployment does this by mounting the same volume read-only into a Caddy container and adding a `handle_path` route for it.

## Running the tag-request API

[`tag-request-api/`](./tag-request-api) is a small dependency-free Node HTTP service (see [`server.js`](./tag-request-api/server.js)) that validates incoming tag requests (connect code format, field length, per-IP rate limiting) and forwards well-formed ones to a Discord channel via a webhook.

```bash
cp .env.example .env   # fill in DISCORD_WEBHOOK_URL, APPROVAL_SECRET, PUBLIC_BASE_URL
docker compose up -d --build tag-request-api
```

In production this container joins the same Docker network as the FlowCRM project's Caddy instance (see `docker-compose.yml`'s `flowcrm_default` external network) so Caddy can `reverse_proxy` `/tag-request` to it by container name - adjust that if you're deploying somewhere else.

### One-click approval

If `APPROVAL_SECRET` and `PUBLIC_BASE_URL` are both set, every Discord message gets **Approve**/**Reject** link buttons alongside the request details. The link encodes the request (action, connect code, a 7-day expiry) as an HMAC-signed token — there's no database, so anyone with the raw URL could act on it, which is why it's only ever posted into the private Discord channel. Clicking:

- **Approve** — verifies the token, then adds or removes the connect code in `DATA_DIR/roster.json` (shared with `leaderboard-cron` via the `leaderboard_data` volume — see `docker-compose.yml`). The change is picked up on the cron job's next loop, so within 8 minutes.
- **Reject** — verifies the token but makes no change; just a dead-end confirmation page.

Clicking Approve twice (or clicking it after someone already hand-edited `roster.json` to the same effect) is a safe no-op — applying the same add/remove twice doesn't double up or error. Leave `APPROVAL_SECRET`/`PUBLIC_BASE_URL` unset to disable the buttons entirely; requests still post to Discord, and approving one goes back to editing `roster.json` by hand.

## Settings

[`settings.js`](./settings.js):

- **title** — base application title
- **description** — used for the meta description and Open Graph/Twitter card tags, so shared links (e.g. in Discord) show a proper preview
- **cname** — adds a CNAME file for a custom domain with gh-pages (leave `null` for a plain `username.github.io/repo` deployment)
- **repoPath** — full URL used as webpack's asset base path for `username.github.io/repoPath` deployments (not used by React Router - see [`App.tsx`](./src/components/App.tsx))
- **dataBaseUrl** — base URL the frontend fetches leaderboard JSON from at runtime (see above)
- **tagRequestUrl** — URL the tag request form POSTs to (see [`tag-request-api/`](./tag-request-api))

## Caveats

- The Slippi API this depends on is undocumented and unofficial, and has changed shape before without notice. If the leaderboard suddenly stops updating, that's the first thing to check.
- Please keep the 1 request/second rate limit in `cron/slippi.ts` — this project only works because Slippi tolerates polite polling.
- Rank-tier logic may drift out of sync with Slippi's own official thresholds over time.
- If you fork this, I'd appreciate you keeping the "buy me a coffee" credit for the original author below.

## Support the original author

☕ [buy me a coffee](https://www.buymeacoffee.com/blorppppp)
