import { session } from 'electron'
import type { Session } from 'electron'

let privateSessionCounter = 0

function applyPrivacyHandlers(ses: Session, isPrivate: boolean): void {
  const chromeVersion = process.versions.chrome
  const chromeMajor = chromeVersion.split('.')[0]

  // Remove "Electron/x.x" from the user agent — Google and reCAPTCHA flag it as a bot
  const cleanUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  ses.setUserAgent(cleanUA)

  // Strip Electron from Sec-CH-UA client hint headers — Google's v3 sign-in flow uses
  // these headers (not user-agent) to detect embedded browsers and reject with /rejected.
  // onBeforeSendHeaders is separate from the adblocker's onBeforeRequest/onHeadersReceived.
  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const headers = { ...details.requestHeaders }

    // Replace Sec-CH-UA: remove "Electron" brand, keep Chrome + Chromium
    headers['Sec-CH-UA'] =
      `"Google Chrome";v="${chromeMajor}", "Chromium";v="${chromeMajor}", "Not.A/Brand";v="8"`
    headers['Sec-CH-UA-Mobile'] = '?0'
    headers['Sec-CH-UA-Platform'] = '"macOS"'

    // Private mode: also strip referrer/origin for tracking reduction
    if (isPrivate) {
      delete headers['Referer']
      delete headers['Origin']
    }

    callback({ requestHeaders: headers })
  })

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

  return ses
}

export function getDefaultSession(): Session {
  const ses = session.defaultSession
  applyPrivacyHandlers(ses, false)
  return ses
}
