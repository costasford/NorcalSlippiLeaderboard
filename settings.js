module.exports = {
  // Base application title used in document.title
  title: 'Norcal Ranked Slippi Leaderboard',

  // Used for the meta description and Open Graph/Twitter card tags -
  // matters for how the link previews when shared (e.g. in Discord).
  description: "Live leaderboard of NorCal Melee players' Slippi ranked stats - ratings, ranks, and character usage, updated every 8 minutes.",

  // use cname option to add CNAME file to webpack build
  // CNAME file allows to use custom domain names with gh-pages, example:
  // cname: 'omatsuri.app'
  cname: null,

  // Full URL used as webpack's output.publicPath so built asset URLs
  // resolve correctly at username.github.io/repoPath. Not used for
  // react-router (HashRouter needs no basename here - see App.tsx).
  // Leave as null for deployments with custom domains.
  repoPath: 'https://costasford.github.io/NorcalSlippiLeaderboard/',

  // Leaderboard data is fetched at runtime from a small cron job that
  // writes JSON here every 8 minutes, rather than baked into the build.
  dataBaseUrl: 'https://68.183.26.83.sslip.io/leaderboard',

  // Tag add/remove requests POST here - a small self-hosted service that
  // forwards them to a private Discord channel, so visitors don't need a
  // GitHub account to ask for a tag change (see tag-request-api/).
  tagRequestUrl: 'https://68.183.26.83.sslip.io/tag-request',
};
