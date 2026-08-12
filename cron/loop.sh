#!/bin/sh
# Runs the fetch job immediately, then every 5 minutes, forever. Replaces the
# old approach of a WSL cron job + full site rebuild/push on every run - this
# just updates a JSON file that the already-deployed frontend fetches at
# runtime.
while true; do
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Running fetchStats..."
  node --loader ts-node/esm --no-warnings cron/fetchStats.ts
  sleep 300
done
