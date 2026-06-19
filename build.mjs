#!/usr/bin/env node
// build.mjs — bundle the dashboard into ONE self-contained HTML (inlining CSS,
// JS, and the repos data), then staticrypt-encrypt it to index.html.
//
// Why: the published page is on a PUBLIC repo (free GitHub Pages), but the data
// lists private repo names. Baking the data in and encrypting the whole page
// means only someone with the password can read any of it. repos.json and the
// unencrypted bundle stay local-only (gitignored) and are NEVER committed.
//
// Requires STATICRYPT_PASSWORD in the environment (sync.sh supplies it from the
// local, gitignored .dashboard-password.txt).

import { readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const here = (p) => new URL(p, import.meta.url)

async function main() {
  const password = process.env.STATICRYPT_PASSWORD
  if (!password) {
    console.error('build failed: STATICRYPT_PASSWORD not set (see .dashboard-password.txt)')
    process.exit(1)
  }

  const [template, css, app, dataRaw] = await Promise.all([
    readFile(here('./src/index.html'), 'utf8'),
    readFile(here('./src/styles.css'), 'utf8'),
    readFile(here('./src/app.js'), 'utf8'),
    readFile(here('./repos.json'), 'utf8'),
  ])

  // Escape every '<' in the JSON so an embedded "</script>" (or "<!--") can't
  // break out of the inline <script>. < is valid JSON and parses normally.
  const dataSafe = dataRaw.replace(/</g, '\\u003c')

  const bundled = template
    .replace('<!--INLINE_STYLES-->', `<style>\n${css}\n</style>`)
    .replace(
      '<!--INLINE_APP-->',
      `<script>window.__REPOS__ = ${dataSafe};</script>\n<script>\n${app}\n</script>`,
    )

  if (bundled.includes('<!--INLINE_STYLES-->') || bundled.includes('<!--INLINE_APP-->')) {
    console.error('build failed: a template marker was not replaced')
    process.exit(1)
  }

  await writeFile(here('./dashboard.source.html'), bundled)
  console.error(`> bundled ${(bundled.length / 1024).toFixed(0)} KB (css + app + data inlined)`)

  // Encrypt: client-side password gate. Output keeps the input filename.
  const outDir = './.staticrypt_out'
  await rm(here(outDir), { recursive: true, force: true })
  await runFile('npx', ['-y', 'staticrypt', 'dashboard.source.html', '--short', '-d', outDir], {
    cwd: new URL('./', import.meta.url),
    env: { ...process.env, STATICRYPT_PASSWORD: password },
    maxBuffer: 64 * 1024 * 1024,
  })

  await copyFile(here(`${outDir}/dashboard.source.html`), here('./index.html'))
  await rm(here(outDir), { recursive: true, force: true })
  console.error('> wrote encrypted index.html (password-gated)')
}

main().catch((e) => {
  console.error('build failed:', e?.message || e)
  process.exit(1)
})
