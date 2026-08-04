#!/usr/bin/env node
/**
 * Installs git hooks. Runs automatically via `npm install` (prepare script).
 */
const fs = require('fs')
const path = require('path')

const hooksDir = path.join(__dirname, '..', '.git', 'hooks')
if (!fs.existsSync(hooksDir)) {
  console.log('No .git/hooks directory — skipping hook installation.')
  process.exit(0)
}

const preCommitHook = path.join(hooksDir, 'pre-commit')
const hookContent = `#!/bin/sh
# Clean Surf pre-commit hook — scans for secrets and personal info
node "$(git rev-parse --show-toplevel)/scripts/check-secrets.js" --pre-commit
`

fs.writeFileSync(preCommitHook, hookContent)
fs.chmodSync(preCommitHook, '755')
console.log('✓ pre-commit hook installed')
