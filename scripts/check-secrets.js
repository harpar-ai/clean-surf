#!/usr/bin/env node
/**
 * Clean Surf — secret/personal-info scanner
 * Runs as a git pre-commit hook and before npm run package.
 * Exits 1 if anything dangerous is found.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RED   = '\x1b[31m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const RESET = '\x1b[0m'

// ─── Patterns that must never appear in committed files ────────────────────────
const BANNED_PATTERNS = [
  // Real email addresses (not the noreply one we intentionally use)
  { re: /[a-zA-Z0-9._%+\-]+@(?!users\.noreply\.github\.com)[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    label: 'Email address' },

  // API keys / tokens
  { re: /(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9+/=_\-]{16,}/gi,
    label: 'API key / token' },

  // AWS credentials
  { re: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key ID' },
  { re: /(?:aws[_-]?secret|secret[_-]?access[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9+/=]{40}/gi,
    label: 'AWS secret key' },

  // Private keys
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, label: 'Private key' },

  // Stripe / payment
  { re: /sk_live_[0-9a-zA-Z]{24,}/g, label: 'Stripe live secret key' },
  { re: /pk_live_[0-9a-zA-Z]{24,}/g, label: 'Stripe live publishable key' },

  // GitHub personal access tokens
  { re: /ghp_[A-Za-z0-9]{36}/g, label: 'GitHub PAT (ghp_)' },
  { re: /github_pat_[A-Za-z0-9_]{82}/g, label: 'GitHub fine-grained PAT' },

  // Generic high-entropy secrets
  { re: /(?:password|passwd|secret|credential)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    label: 'Hardcoded password/secret' },

  // Local machine paths with username
  { re: /\/Users\/(?!runner|github|ubuntu)[a-zA-Z][a-zA-Z0-9_.-]{2,}\//g,
    label: 'Local machine path with username' },

  // localhost with port (dev server leakage)
  { re: /(?:http:\/\/)?localhost:[0-9]{4,5}/g, label: 'localhost URL with port' },
]

// ─── Directories / files that must never be staged ────────────────────────────
const BANNED_PATHS = [
  /^\.claude\//,
  /^\.env$/,
  /^\.env\./,
  /node_modules\//,
  /dist\//,
  /^out\//,
]

// ─── Binary extensions to skip ────────────────────────────────────────────────
const SKIP_EXTENSIONS = new Set([
  '.icns', '.png', '.jpg', '.jpeg', '.gif', '.ico',
  '.ttf', '.woff', '.woff2', '.eot',
  '.zip', '.dmg', '.app',
  '.lock', // package-lock is auto-generated, contains maintainer emails — skip pattern scan
])

// ─── Specific files to skip pattern scanning (not path checking) ───────────────
const SKIP_FILES = new Set([
  'package-lock.json', // auto-generated, contains third-party maintainer emails
])

// ─── Get files to scan ────────────────────────────────────────────────────────
function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function getAllTrackedFiles() {
  try {
    const out = execSync('git ls-files', { encoding: 'utf8' })
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const isPreCommit = process.env.GIT_INDEX_FILE !== undefined || process.argv.includes('--pre-commit')
const isFullScan  = process.argv.includes('--all')

const files = isFullScan ? getAllTrackedFiles() : getStagedFiles()

if (files.length === 0 && !isFullScan) {
  console.log(`${GREEN}✓ No staged files to scan${RESET}`)
  process.exit(0)
}

const errors = []
const warnings = []

for (const file of files) {
  // Check banned path patterns
  const bannedPath = BANNED_PATHS.find(re => re.test(file))
  if (bannedPath) {
    errors.push({ file, line: null, label: `Banned path pattern (${bannedPath})`, match: file })
    continue
  }

  const ext = path.extname(file).toLowerCase()
  if (SKIP_EXTENSIONS.has(ext)) continue
  if (SKIP_FILES.has(path.basename(file))) continue

  // Read file content
  const fullPath = path.join(process.cwd(), file)
  if (!fs.existsSync(fullPath)) continue
  const content = fs.readFileSync(fullPath, 'utf8')
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { re, label } of BANNED_PATTERNS) {
      re.lastIndex = 0
      const match = re.exec(line)
      if (match) {
        // Whitelist: noreply email in update-checker is intentional
        if (label === 'Email address' && match[0].includes('noreply.github.com')) continue
        // Whitelist: localhost in comments / test URLs
        if (label === 'localhost URL with port' && (line.trim().startsWith('//') || file.includes('test'))) continue
        // Whitelist: /Users/runner (GitHub Actions CI path)
        if (label === 'Local machine path' && match[0].includes('/Users/runner/')) continue

        errors.push({ file, line: i + 1, label, match: match[0].slice(0, 60) })
      }
    }
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────
if (errors.length === 0) {
  const scanDesc = isFullScan ? 'all tracked files' : `${files.length} staged file(s)`
  console.log(`${GREEN}✓ Secret scan passed — ${scanDesc} clean${RESET}`)
  process.exit(0)
}

console.error(`\n${RED}✗ Secret scan FAILED — ${errors.length} issue(s) found:${RESET}\n`)
for (const { file, line, label, match } of errors) {
  const loc = line ? `${file}:${line}` : file
  console.error(`  ${RED}${label}${RESET}`)
  console.error(`  → ${loc}`)
  console.error(`  → "${match}"\n`)
}
console.error(`${YELLOW}Fix these before committing. If a match is a false positive,`)
console.error(`add a whitelist entry in scripts/check-secrets.js.${RESET}\n`)
process.exit(1)
