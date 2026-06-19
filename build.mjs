#!/usr/bin/env node
// build.mjs — bundle the dashboard into one self-contained HTML, AES-256-GCM
// encrypt it with a stable Content Encryption Key (CEK), and wrap that CEK with
// the password. The result is index.html: a small unlock gate + the encrypted
// payload. Passkey (Face ID) wrapping of the same CEK happens in the browser at
// enrollment time and is stored in localStorage — see src/gate.js.
//
// Stable across builds (so existing passkey enrollments keep working):
//   .dashboard-keys.json  -> { cek, prfSalt }   (gitignored, local only)
//   .dashboard-password.txt -> the recovery password (gitignored)
// Everything sensitive stays local; only the encrypted index.html is committed.

import { readFile, writeFile, access } from 'node:fs/promises'
import crypto from 'node:crypto'

const here = (p) => new URL(p, import.meta.url)
const ITER = 600000 // PBKDF2-HMAC-SHA256 rounds for the password wrap
const b64 = (b) => Buffer.from(b).toString('base64')

// AES-256-GCM, output = ciphertext||authTag (matches WebCrypto's format).
function aesGcm(keyBuf, ivBuf, plainBuf) {
  const c = crypto.createCipheriv('aes-256-gcm', keyBuf, ivBuf)
  const ct = Buffer.concat([c.update(plainBuf), c.final()])
  return Buffer.concat([ct, c.getAuthTag()])
}

async function exists(url) { try { await access(url); return true } catch { return false } }

// Map a bold venture label in TODO.md to a venture id used by the dashboard.
const VENTURE_MAP = {
  peanut: "peanut", exceed: "exceed", ayuva: "ayuva", goody: "goody", kemuri: "kemuri",
  sung: "sung", sung1975: "sung", tqhb: "tqhb", kiki: "kiki", bungo: "bungo", lombok: "lombok",
  personal: "personal",
}
// 32-bit FNV hash -> stable id so a given to-do line never duplicates across builds.
function seedId(text) { let n = 2166136261; for (let i = 0; i < text.length; i++) { n ^= text.charCodeAt(i); n = Math.imul(n, 16777619) } return "seed-" + (n >>> 0) }

async function parseTodoSeeds() {
  const f = here('./TODO.md')
  if (!(await exists(f))) return []
  const md = await readFile(f, 'utf8')
  const out = []
  for (const raw of md.split('\n')) {
    const m = raw.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/)
    if (!m) continue
    const done = m[1].toLowerCase() === 'x'
    let text = m[2].trim()
    let venture = 'other'
    const vb = text.match(/^\*\*([^*]+)\*\*\s*[—\-:]\s*(.+)$/) // "**Peanut** — ..."
    if (vb) { venture = VENTURE_MAP[vb[1].trim().toLowerCase()] || 'other'; text = vb[2].trim() }
    text = text.replace(/\*\*/g, '').trim()
    if (text) out.push({ id: seedId(text), text, venture, done, seed: true })
  }
  return out
}

async function loadKeys() {
  const f = here('./.dashboard-keys.json')
  if (await exists(f)) return JSON.parse(await readFile(f, 'utf8'))
  const keys = { cek: b64(crypto.randomBytes(32)), prfSalt: b64(crypto.randomBytes(32)) }
  await writeFile(f, JSON.stringify(keys, null, 2) + '\n')
  console.error('> generated new CEK + prfSalt (.dashboard-keys.json)')
  return keys
}

async function main() {
  const password = (await readFile(here('./.dashboard-password.txt'), 'utf8')).trim()
  if (!password) { console.error('build failed: empty .dashboard-password.txt'); process.exit(1) }
  const keys = await loadKeys()
  const cek = Buffer.from(keys.cek, 'base64')

  // 1) Build the self-contained dashboard (inline css + app + data).
  const [template, css, app, dataRaw] = await Promise.all([
    readFile(here('./src/index.html'), 'utf8'),
    readFile(here('./src/styles.css'), 'utf8'),
    readFile(here('./src/app.js'), 'utf8'),
    readFile(here('./repos.json'), 'utf8'),
  ])
  // Seed to-dos from a local (gitignored) TODO.md — e.g. the overnight report.
  // Baked encrypted into the bundle; never committed in plaintext.
  const seedTodos = await parseTodoSeeds()
  const dataSafe = dataRaw.replace(/</g, '\\u003c')
  // NOTE: use FUNCTION replacements — a string replacement would interpret
  // "$$", "$&", etc. in the inlined JS/data as special patterns and corrupt it.
  const bundle = template
    .replace('<!--INLINE_STYLES-->', () => `<style>\n${css}\n</style>`)
    .replace('<!--INLINE_APP-->', () => `<script>window.__REPOS__ = ${dataSafe};\nwindow.__SEED_TODOS__ = ${JSON.stringify(seedTodos)};</script>\n<script>\n${app}\n</script>`)
  if (bundle.includes('<!--INLINE_')) { console.error('build failed: marker left unreplaced'); process.exit(1) }

  // 2) Encrypt the bundle with the CEK.
  const payloadIv = crypto.randomBytes(12)
  const payload = aesGcm(cek, payloadIv, Buffer.from(bundle, 'utf8'))

  // 3) Wrap the CEK with the password (PBKDF2 -> AES-GCM).
  const pwSalt = crypto.randomBytes(16)
  const pwIv = crypto.randomBytes(12)
  const pwKey = crypto.pbkdf2Sync(password, pwSalt, ITER, 32, 'sha256')
  const pwWrappedCEK = aesGcm(pwKey, pwIv, cek)

  const cfg = {
    payload: payload.toString('base64'),
    payloadIv: b64(payloadIv),
    pwWrappedCEK: pwWrappedCEK.toString('base64'),
    pwSalt: b64(pwSalt),
    pwIv: b64(pwIv),
    iter: ITER,
    prfSalt: keys.prfSalt,
  }

  // 4) Assemble the gate page: gate.html + inlined gate.js + cfg JSON.
  const gateHtml = await readFile(here('./src/gate.html'), 'utf8')
  const gateJs = (await readFile(here('./src/gate.js'), 'utf8')).replace(/<\/script/gi, '<\\/script')
  const out = gateHtml
    .replace('{{CFG}}', () => JSON.stringify(cfg))
    .replace('{{GATE_JS}}', () => gateJs)
  if (out.includes('{{CFG}}') || out.includes('{{GATE_JS}}')) { console.error('build failed: gate placeholder left'); process.exit(1) }

  await writeFile(here('./index.html'), out)
  console.error(`> wrote index.html — ${(out.length / 1024).toFixed(0)} KB (Face ID + password gate, encrypted payload)`)
}

main().catch((e) => { console.error('build failed:', e?.message || e); process.exit(1) })
