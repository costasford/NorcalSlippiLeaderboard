# Norcal Ranked Slippi Leaderboard

[![CI](https://github.com/costasford/NorcalSlippiLeaderboard/actions/workflows/ci.yml/badge.svg)](https://github.com/costasford/NorcalSlippiLeaderboard/actions/workflows/ci.yml)

Code powering https://costasford.github.io/NorcalSlippiLeaderboard/#/

A live leaderboard of NorCal Melee players' Slippi ranked stats, sorted by rating.

Fork of [Grantismo/CoSlippiLeaderboard](https://github.com/Grantismo/CoSlippiLeaderboard), itself built on [react-pages-boilerplate](https://github.com/rtivital/react-pages-boilerplate).

## How it works

Two independent pieces:

- **[`src/`](./src)** — a static React site, deployed to GitHub Pages. It fetches the current leaderboard data at *runtime* rather than having it baked into the build, so the site only needs redeploying when the code actually changes.
- **[`cron/`](./cron)** — a small containerized job that fetches every player's current stats from Slippi's API, sorts them, and writes the result as JSON. It runs on a small always-on VPS via Docker Compose, on a loop (currently every 8 minutes — a nod to Melee's standard stock timer), and doesn't touch git or rebuild the site at all.

A reverse proxy (Caddy) on that same VPS serves the JSON over HTTPS, and `settings.js`'s `dataBaseUrl` tells the frontend where to fetch it from.

This is a meaningfully different architecture than the original fork: the old version had the cron job git-commit its output and trigger a full site rebuild + redeploy on every run, from a personal machine. That's fragile (one uncommitted change on that machine and deploys silently stop) and heavy (a full site rebuild every few minutes forever). Splitting "data" from "site" means the data updates independently and the site only needs touching for real changes.

## Tech stack

- TypeScript
- [Webpack 5](https://webpack.js.org/) as the module bundler
- [ESLint](https://eslint.org/) for linting
- [Tailwind](https://tailwindcss.com/) for CSS
- Docker Compose for the cron job

## Requesting a tag be added or removed

Click **"Request a tag be added or removed"** on the site itself, or [open a Tag Request issue](https://github.com/costasford/NorcalSlippiLeaderboard/issues/new?template=tag-request.yml) directly. Requests are reviewed manually and, if approved, added to `cron/players.json`.

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

The player list lives in [`cron/players.json`](./cron/players.json) — a flat array of Slippi connect codes (`connectCodes`). To add or remove players directly (rather than going through a tag request), edit that file.

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

## Settings

[`settings.js`](./settings.js):

- **title** — base application title
- **cname** — adds a CNAME file for a custom domain with gh-pages (leave `null` for a plain `username.github.io/repo` deployment)
- **repoPath** — full URL used as webpack's asset base path for `username.github.io/repoPath` deployments (not used by React Router - see [`App.tsx`](./src/components/App.tsx))
- **dataBaseUrl** — base URL the frontend fetches leaderboard JSON from at runtime (see above)

## Caveats

- The Slippi API this depends on is undocumented and unofficial, and has changed shape before without notice. If the leaderboard suddenly stops updating, that's the first thing to check.
- Please keep the 1 request/second rate limit in `cron/slippi.ts` — this project only works because Slippi tolerates polite polling.
- Rank-tier logic may drift out of sync with Slippi's own official thresholds over time.
- If you fork this, I'd appreciate you keeping the "buy me a coffee" credit for the original author below.

## Support the original author

☕ [buy me a coffee](https://www.buymeacoffee.com/blorppppp)
