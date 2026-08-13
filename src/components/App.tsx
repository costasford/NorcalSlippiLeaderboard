import React from 'react';
import { HashRouter, Route, Switch } from 'react-router-dom';
import HomePage from './routes/home/HomePage';

// No basename here on purpose. HashRouter's basename is checked against
// the hash fragment itself (everything after "#"), not the URL path
// before it - so for a GitHub Pages deployment at
// username.github.io/repo/#/, the repo path is already handled by
// wherever index.html is served from, and the hash always starts fresh
// at "/". Passing settings.repoPath (used elsewhere for webpack's
// output.publicPath) as basename here previously caused a "does not
// begin with the basename" warning on every load; it happened to still
// render because failed basename-stripping is a no-op and the one route
// (/) matched anyway, but it would have silently broken any additional
// route or <Link>-based navigation.
export default function App() {
  return (
    <HashRouter>
      <Switch>
        <Route exact path="/" component={HomePage} />
      </Switch>
    </HashRouter>
  );
}
