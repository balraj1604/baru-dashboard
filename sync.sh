#!/usr/bin/env bash
# sync.sh — pull every repo (all orgs + personal), rebuild the encrypted
# dashboard, and publish it. Run whenever you want new repos to show up.
#
# Flow:  gh -> repos.json (local)  ->  build.mjs bundles + encrypts  ->  index.html
# Only the encrypted index.html is committed. repos.json never leaves this machine.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .dashboard-password.txt ]; then
  echo "✗ missing .dashboard-password.txt (the staticrypt password)"; exit 1
fi
export STATICRYPT_PASSWORD="$(cat .dashboard-password.txt)"

echo "→ pulling repos from GitHub…"
node sync.mjs
echo "→ building encrypted dashboard…"
node build.mjs

if git diff --quiet -- index.html; then
  echo "✓ no changes — dashboard already up to date"
  exit 0
fi

git add index.html
git commit -m "chore: rebuild dashboard ($(date -u +%Y-%m-%dT%H:%MZ))"
git push origin main
echo "✓ synced & pushed — live site refreshes in ~30s"
