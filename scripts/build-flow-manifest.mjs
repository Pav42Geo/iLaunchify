#!/usr/bin/env node
// =============================================================================
// Flow manifest generator — the shared map of the organism (2026-07-06).
// =============================================================================
//
// Produces flow-manifest.json: a machine-readable picture of how the platform
// fits together, so both humans and agents can reason about "what connects to
// what" without re-deriving it from 60 memory files.
//
// Two layers:
//   • DERIVED (this script) — the real dependency + consumer graph, computed
//     from each package's workspace deps, its export-surface size, and a scan of
//     who imports it. Always current; never lies about the code.
//   • CURATED (.claude/flows.curated.json) — package roles + the ordered trunk
//     flows (order / product / partner) + the cross-cutting substrate. Encodes
//     INTENT, which imports can't reveal. Edit that file when a flow changes.
//
// The `connection-review` subagent reads flow-manifest.json to locate a diff on
// the flow graph and find the consumers of a changed package. check-invariants
// can grow to read it too.
//
// Run:  pnpm manifest         (writes flow-manifest.json)
//       pnpm manifest --check  (fails if the manifest is stale vs. the code)
// =============================================================================

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CHECK = process.argv.includes('--check')
const OUT = 'flow-manifest.json'
const CURATED = '.claude/flows.curated.json'
const PRUNE = new Set(['node_modules', '.next', 'dist', '.turbo', '.git', 'FOD-reference'])
const PKG_RX = /@ilaunchify\/[a-z0-9-]+/g

const read = (f) => readFileSync(f, 'utf8')

// ── 1. discover packages: name + workspace deps + export-surface size ────────
function discoverPackages() {
  const pkgs = {}
  for (const dir of readdirSync('packages')) {
    const pj = `packages/${dir}/package.json`
    if (!existsSync(pj)) continue
    const meta = JSON.parse(read(pj))
    const name = meta.name
    if (!name) continue
    const allDeps = { ...meta.dependencies, ...meta.devDependencies, ...meta.peerDependencies }
    const dependsOn = Object.keys(allDeps).filter((d) => d.startsWith('@ilaunchify/')).sort()
    // export surface = export lines in the public entrypoint (a rough contract size)
    let exportSurface = 0
    for (const entry of [`packages/${dir}/src/index.ts`, `packages/${dir}/src/index.tsx`]) {
      if (existsSync(entry)) {
        exportSurface = read(entry).split('\n').filter((l) => /^\s*export\b/.test(l)).length
        break
      }
    }
    pkgs[name] = { dir: `packages/${dir}`, dependsOn, exportSurface, consumedBy: {} }
  }
  return pkgs
}

// ── 2. scan who imports each @ilaunchify/* package, attributed to a module ───
function ownerModule(path) {
  const m = path.match(/^(apps\/[^/]+|packages\/[^/]+)\//)
  return m ? m[1] : 'root'
}
function walk(dir, out) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (PRUNE.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
}
function scanConsumers(pkgs) {
  const files = []
  for (const r of ['apps', 'packages']) walk(r, files)
  for (const f of files) {
    const owner = ownerModule(f)
    const matches = read(f).match(PKG_RX)
    if (!matches) continue
    const seen = new Set()
    for (const dep of matches) {
      if (!pkgs[dep]) continue          // skip @ilaunchify/db etc. if not in packages/ (it is) or typos
      if (owner === pkgs[dep].dir) continue // don't count self-imports
      // count each importing FILE once per package
      const key = `${owner}::${dep}`
      if (seen.has(key)) continue
      seen.add(key)
      pkgs[dep].consumedBy[owner] = (pkgs[dep].consumedBy[owner] || 0) + 1
    }
  }
  // sort consumedBy by count desc for readability
  for (const p of Object.values(pkgs)) {
    p.consumedBy = Object.fromEntries(Object.entries(p.consumedBy).sort((a, b) => b[1] - a[1]))
  }
}

// ── 3. merge curated intent (roles + flows + substrate) ──────────────────────
function buildManifest() {
  const pkgs = discoverPackages()
  scanConsumers(pkgs)

  const curated = existsSync(CURATED) ? JSON.parse(read(CURATED)) : { roles: {}, flows: [], substrate: {} }
  const roles = curated.roles || {}

  // attach roles; flag any package missing a curated role (drift signal)
  const missingRole = []
  for (const [name, p] of Object.entries(pkgs)) {
    p.role = roles[name] || null
    if (!p.role) missingRole.push(name)
  }
  // flag curated flows that reference a package no longer present
  const known = new Set(Object.keys(pkgs))
  const danglingRefs = []
  const scan = (obj) => {
    if (typeof obj === 'string') {
      for (const m of obj.match(PKG_RX) || []) if (!known.has(m)) danglingRefs.push(m)
    } else if (obj && typeof obj === 'object') {
      for (const v of Object.values(obj)) scan(v)
    }
  }
  scan(curated.flows)
  scan(curated.substrate)

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    generator: 'scripts/build-flow-manifest.mjs',
    packageCount: Object.keys(pkgs).length,
    drift: {
      packagesMissingCuratedRole: [...new Set(missingRole)].sort(),
      curatedRefsToMissingPackages: [...new Set(danglingRefs)].sort(),
    },
    flows: curated.flows || [],
    substrate: curated.substrate || {},
    packages: pkgs,
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const manifest = buildManifest()
const json = JSON.stringify(manifest, null, 2) + '\n'

if (CHECK) {
  const current = existsSync(OUT) ? read(OUT) : ''
  // compare everything except the generatedAt date line
  const strip = (s) => s.replace(/"generatedAt": "[^"]*",\n/, '')
  if (strip(current) !== strip(json)) {
    console.error(`✖ ${OUT} is stale — run \`pnpm manifest\` and commit the result.`)
    process.exit(1)
  }
  console.log(`✓ ${OUT} is up to date.`)
  process.exit(0)
}

writeFileSync(OUT, json)
const d = manifest.drift
console.log(`✓ wrote ${OUT} — ${manifest.packageCount} packages mapped.`)
if (d.packagesMissingCuratedRole.length) {
  console.log(`  ⚠ ${d.packagesMissingCuratedRole.length} package(s) missing a curated role: ${d.packagesMissingCuratedRole.join(', ')}`)
}
if (d.curatedRefsToMissingPackages.length) {
  console.log(`  ⚠ curated flows reference missing package(s): ${d.curatedRefsToMissingPackages.join(', ')}`)
}
