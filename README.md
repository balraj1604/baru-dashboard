# Baru's Dashboard

A live, organized view of **every GitHub repository** across all your
organizations and your personal account — grouped by org, searchable, with a
lock icon on private repos, a globe on public ones, a **Live sites** filter, and
one-click jump to each repo's live page.

**Live (password-gated):** https://balraj1604.github.io/baru-dashboard/

## Why it's encrypted

The repo is public (so GitHub Pages serves it free), but the data lists your
**private** repo names. So the whole page is **client-side encrypted** with
[staticrypt](https://github.com/robinmoisson/staticrypt): it prompts for a
password and decrypts in the browser. The repo never contains your data in
plaintext — `repos.json` and the unencrypted bundle are gitignored and stay on
your machine only.

```
sync.mjs ──> repos.json ──> build.mjs ──> dashboard.source.html ──> index.html
(gh CLI)    (LOCAL only)   (inline+bundle)   (LOCAL only)         (ENCRYPTED, committed)
```

## Refreshing / pulling new repos

```bash
./sync.sh
```

Pulls all repos, rebuilds the encrypted page, commits **only** the encrypted
`index.html`, and pushes. GitHub Pages redeploys in ~30s.

## Password

The staticrypt password lives in `.dashboard-password.txt` (gitignored, local
only). To change it, edit that file and run `./sync.sh` (or `node build.mjs`).

## Files

| File | Role | Committed? |
|------|------|------------|
| `index.html` | Encrypted, self-contained dashboard | ✅ (encrypted) |
| `src/` | Editable sources (html / css / js) | ✅ (no data) |
| `sync.mjs` | Generates `repos.json` from `gh` | ✅ |
| `build.mjs` | Bundles + encrypts | ✅ |
| `repos.json` | Repo data (plaintext) | ❌ local only |
| `dashboard.source.html` | Unencrypted bundle | ❌ local only |
| `.dashboard-password.txt` | staticrypt password | ❌ local only |

## Requirements

- [`gh`](https://cli.github.com) authenticated (`gh auth status`)
- Node 18+ · `npx` (for staticrypt, fetched on first build)
