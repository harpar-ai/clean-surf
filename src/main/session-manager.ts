import { session } from 'electron'
import type { Session } from 'electron'

let privateSessionCounter = 0

function applyPrivacyHandlers(ses: Session, isPrivate: boolean): void {
  // Remove "Electron/x.x" from the user agent — Google and reCAPTCHA flag it as a bot
  const chromeVersion = process.versions.chrome
  const cleanUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  ses.setUserAgent(cleanUA)

  // Deny notification permission requests at the Chromium level
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'notifications') {
      callback(false)
      return
    }
    callback(!isPrivate) // Private: deny everything; Normal: allow others
  })

  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'notifications') return false
    return !isPrivate
  })
}

export function createPrivateSession(): Session {
  const id = ++privateSessionCounter
  const ses = session.fromPartition(`private:${id}`, { cache: false })

  applyPrivacyHandlers(ses, true)

  // Block all third-party cookies
  ses.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (!removed && cookie.domain && !cookie.hostOnly) {
      ses.cookies.remove(`https://${cookie.domain}`, cookie.name)
    }
  })

  // Strip referrer and tracking headers
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    delete headers['Referer']
    delete headers['Origin']
    callback({ requestHeaders: headers })
  })

  return ses
}

export function getDefaultSession(): Session {
  const ses = session.defaultSession
  applyPrivacyHandlers(ses, false)
  return ses
}
