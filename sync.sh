#!/usr/bin/env bash
# sync.sh — pull every repo (all orgs + personal), rebuild the encrypted
# Face-ID/password-gated dashboard, and publish it.
set -euo pipefail
cd "$(dirname "$0")"

echo "→ pulling repos from GitHub…"
node sync.mjs
echo "→ building encrypted dashboard…"
node build.mjs

if git diff --quiet -- index.html; then
  echo "✓ no changes — dashboard already up to date"; exit 0
fi
git add index.html
git commit -m "chore: rebuild dashboard ($(date -u +%Y-%m-%dT%H:%MZ))"
git push origin main
echo "✓ synced & pushed — live in ~30s"
