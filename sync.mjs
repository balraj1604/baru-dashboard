#!/usr/bin/env node
// sync.mjs — regenerate repos.json from GitHub via the authenticated `gh` CLI.
// Pulls every repo the user owns or can access through an org, enriches each
// with a description (README fallback) and a live GitHub Pages URL when one
// exists, then writes repos.json for the dashboard to render.
//
// Safety: every shell-out goes through node:child_process execFile with an
// argv array (no shell string), so repo names can never be interpreted as
// shell. Nothing here interpolates user input into a command string.
//
// Usage:  node sync.mjs        (then commit + push repos.json)
//   or:   ./sync.sh            (does node sync.mjs + git push for you)

import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const CONCURRENCY = 8
const DESC_MAX = 160

// --- gh helpers -------------------------------------------------------------

async function gh(args, { raw = false } = {}) {
  const { stdout } = await runFile('gh', args, { maxBuffer: 64 * 1024 * 1024 })
  return raw ? stdout : JSON.parse(stdout)
}

// Run async tasks with a bounded concurrency pool.
async function pool(items, worker, size = CONCURRENCY) {
  const out = new Array(items.length)
  let i = 0
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return out
}

// --- enrichment -------------------------------------------------------------

// Pull the first human-readable sentence out of a README, skipping headings,
// badges, HTML, and front-matter so cards say something real.
function readmeBlurb(md) {
  if (!md) return ''
  const lines = md.replace(/\r/g, '').split('\n')
  for (let raw of lines) {
    let l = raw.trim()
    if (!l) continue
    if (l.startsWith('#')) l = l.replace(/^#+\s*/, '') // keep H1 text, drop hashes
    if (/^!\[/.test(l) || /^\[!\[/.test(l)) continue // badge / image lines
    if (/^<.*>$/.test(l)) continue // bare html tag line
    if (/^[-=*_]{3,}$/.test(l)) continue // horizontal rule
    if (l.startsWith('|') || l.startsWith('>')) continue // table / quote
    l = l
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> text
      .replace(/[*_`~]/g, '') // inline markdown
      .replace(/<[^>]+>/g, '') // stray html
      .trim()
    if (l.length < 8) continue
    return l.length > DESC_MAX ? l.slice(0, DESC_MAX - 1).trimEnd() + '…' : l
  }
  return ''
}

async function fetchReadmeBlurb(full) {
  try {
    const md = await gh(
      ['api', `repos/${full}/readme`, '-H', 'Accept: application/vnd.github.raw'],
      { raw: true },
    )
    return readmeBlurb(md)
  } catch {
    return ''
  }
}

// A repo may publish via GitHub Pages even without a homepage set — surface it.
async function fetchPagesUrl(full) {
  try {
    const p = await gh(['api', `repos/${full}/pages`])
    return p?.html_url || ''
  } catch {
    return ''
  }
}

function looksLikeUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim())
}

// --- main -------------------------------------------------------------------

async function main() {
  const me = await gh(['api', 'user', '--jq', '{login:.login,name:.name,avatar:.avatar_url}'])
  console.error(`> authenticated as ${me.login}`)

  const rawRepos = await gh([
    'api',
    '/user/repos?affiliation=owner,organization_member,collaborator&sort=pushed&per_page=100',
    '--paginate',
  ])
  console.error(`> ${rawRepos.length} repos accessible`)

  const enriched = await pool(rawRepos, async (r) => {
    const full = r.full_name
    let description = (r.description || '').trim()
    let descSource = description ? 'gh' : ''
    if (!description) {
      description = await fetchReadmeBlurb(full)
      if (description) descSource = 'readme'
    }
    let liveUrl = looksLikeUrl(r.homepage) ? r.homepage.trim() : ''
    if (!liveUrl) liveUrl = await fetchPagesUrl(full)
    process.stderr.write('.')
    return {
      name: r.name,
      owner: r.owner.login,
      avatar: r.owner.avatar_url,
      full_name: full,
      private: r.private,
      archived: r.archived,
      fork: r.fork,
      description,
      descSource,
      language: r.language || '',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      pushedAt: r.pushed_at,
      updatedAt: r.updated_at,
      url: r.html_url,
      liveUrl,
      defaultBranch: r.default_branch,
    }
  })
  process.stderr.write('\n')

  // Owner roll-up for filter chips / section headers.
  const ownerMap = new Map()
  for (const r of enriched) {
    const o = ownerMap.get(r.owner) || {
      login: r.owner,
      avatar: r.avatar,
      isUser: r.owner === me.login,
      count: 0,
      private: 0,
    }
    o.count++
    if (r.private) o.private++
    ownerMap.set(r.owner, o)
  }

  const owners = [...ownerMap.values()].sort((a, b) => {
    if (a.isUser !== b.isUser) return a.isUser ? -1 : 1 // user first
    return b.count - a.count
  })

  const data = {
    generatedAt: new Date().toISOString(),
    login: me.login,
    name: me.name,
    avatar: me.avatar,
    totals: {
      repos: enriched.length,
      owners: owners.length,
      private: enriched.filter((r) => r.private).length,
      public: enriched.filter((r) => !r.private).length,
    },
    owners,
    repos: enriched,
  }

  await writeFile(new URL('./repos.json', import.meta.url), JSON.stringify(data, null, 2) + '\n')
  console.error(
    `> wrote repos.json — ${data.totals.repos} repos, ${data.totals.owners} owners, ${data.totals.private} private`,
  )
}

main().catch((e) => {
  console.error('sync failed:', e?.message || e)
  process.exit(1)
})
