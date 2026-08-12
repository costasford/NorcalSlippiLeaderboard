module.exports = {
  // Base application title used in document.title
  title: 'Norcal Ranked Slippi Leaderboard',

  // use cname option to add CNAME file to webpack build
  // CNAME file allows to use custom domain names with gh-pages, example:
  // cname: 'omatsuri.app'
  cname: null,

  // add repo path for username.github.io/repoPath for react router to recognize paths,
  // use only when deployed to github.io, leave as null for deployments with custom domains
  repoPath: 'https://costasford.github.io/NorcalSlippiLeaderboard/',

  // Google sheets ID for player connect codes.
  // https://docs.google.com/spreadsheets/d/[YOUR ID]
  spreadsheetID: '1DPIFD0RUA3yjruregmFUbUJ7ccdOjVB2LBp0goHvL-A',

  // Leaderboard data is fetched at runtime from a small cron job that
  // writes JSON here every 8 minutes, rather than baked into the build.
  dataBaseUrl: 'https://68.183.26.83.sslip.io/leaderboard',
};
