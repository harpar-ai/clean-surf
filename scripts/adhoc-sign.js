/**
 * electron-builder afterSign hook — runs BEFORE the DMG is created.
 * Ad-hoc signs the .app so macOS shows "unidentified developer"
 * instead of "damaged and can't be opened".
 */
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterSign(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productName}.app`)
  console.log(`Ad-hoc signing: ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath])
  console.log('✓ Ad-hoc signing complete')
}
