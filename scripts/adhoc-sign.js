/**
 * Ad-hoc signs the packaged .app inside the DMG's staging folder.
 * Ad-hoc signing (-) means no certificate is needed but Gatekeeper
 * downgrades the block from "damaged" → "unidentified developer",
 * which users can bypass with right-click → Open.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const glob = require('fs').readdirSync

const appDir = path.join(__dirname, '..', 'dist', 'mac-arm64')
const app = path.join(appDir, 'Clean Surf.app')

if (!fs.existsSync(app)) {
  console.log('Ad-hoc sign: app not found at', app, '— skipping')
  process.exit(0)
}

console.log('Ad-hoc signing', app)
execFileSync('codesign', [
  '--force', '--deep', '--sign', '-',
  '--options', 'runtime',
  app
])
console.log('✓ Ad-hoc signing complete')
