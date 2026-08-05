// Injected into every web page's isolated preload context.
// Privacy overrides that affect the PAGE's main world are injected via <script>
// because contextIsolation:true means this preload's window !== page's window.

// ──────────────────────────────────────────────────────────────────────────────
// CSS cookie banner blocking — DOM manipulation works across worlds
// ──────────────────────────────────────────────────────────────────────────────
function injectBlockingCSS(): void {
  const style = document.createElement('style')
  style.dataset.cleansurf = 'cookie-blocker'
  style.textContent = `
    #onetrust-banner-sdk,
    #CybotCookiebotDialog,
    #truste-consent-track,
    [data-testid="uc-consent-manager"],
    #didomi-host,
    .qc-cmp2-container,
    [class*="cookie-banner"],
    [class*="cookie-consent"],
    [id*="cookie-banner"],
    [id*="cookie-consent"],
    [class*="gdpr-banner"] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `
  document.documentElement.appendChild(style)
}

// ──────────────────────────────────────────────────────────────────────────────
// Main-world injection — Notification blocking, SSO blocking, fingerprint spoof
// All of this runs in the PAGE's main world via an injected <script> element.
// ──────────────────────────────────────────────────────────────────────────────

// Extract per-session seed from additionalArguments (passed at WebContentsView creation)
const seedArg = process.argv.find(a => a.startsWith('--fp-seed='))
const fpSeed = seedArg ? parseFloat(seedArg.replace('--fp-seed=', '')) : 0
// Deterministic noise for this session
const sessionNoise = (((fpSeed || Math.random() * 1e9) * 1664525 + 1013904223) >>> 0) / 0xffffffff

function injectMainWorld(): void {
  const code = `
(function(SESSION_NOISE) {
  // ── 1. Block notification permission prompts ──────────────────────────────
  const _FakeNotif = class {
    static permission = 'denied';
    static requestPermission() { return Promise.resolve('denied'); }
    constructor() { throw new Error('Notifications blocked by Clean Surf'); }
  };
  try {
    Object.defineProperty(window, 'Notification', {
      value: _FakeNotif, writable: false, configurable: false
    });
  } catch(e) {}

  // ── 2. Block SSO pop-ups ──────────────────────────────────────────────────
  const SSO_DOMAINS = [
    'accounts.google.com','appleid.apple.com','login.microsoftonline.com',
    'login.live.com','www.facebook.com/login','twitter.com/i/oauth','github.com/login/oauth'
  ];
  const _origOpen = window.open.bind(window);
  window.open = function(url) {
    if (url && SSO_DOMAINS.some(d => String(url).includes(d))) {
      console.debug('[CleanSurf] SSO popup blocked:', url);
      return null;
    }
    return _origOpen.apply(this, arguments);
  };

  // ── 3. Canvas fingerprint noise ───────────────────────────────────────────
  function noise(v) { return Math.max(0, Math.min(255, Math.round(v + SESSION_NOISE))); }

  const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
    const d = _getImageData.call(this, sx, sy, sw, sh);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = noise(d.data[i]);
      d.data[i+1] = noise(d.data[i+1]);
      d.data[i+2] = noise(d.data[i+2]);
    }
    return d;
  };

  // toDataURL: do NOT modify the canvas in place (putImageData breaks reCAPTCHA).
  // The getImageData override already adds consistent per-session noise on reads,
  // so canvas uniqueness is preserved without mutating the pixel buffer.

  // ── 4. WebGL renderer/vendor spoof ───────────────────────────────────────
  function spoofGL(ctx) {
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return;
    const orig = ctx.getParameter.bind(ctx);
    ctx.getParameter = function(p) {
      if (p === ext.UNMASKED_RENDERER_WEBGL) return 'Apple GPU';
      if (p === ext.UNMASKED_VENDOR_WEBGL) return 'Apple';
      return orig(p);
    };
  }
  const _getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type) {
    const ctx = _getCtx.apply(this, arguments);
    if (ctx && (type === 'webgl' || type === 'webgl2')) spoofGL(ctx);
    return ctx;
  };

  // ── 5. Screen normalisation ───────────────────────────────────────────────
  try {
    Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth',  { get: () => 24, configurable: true });
  } catch(e) {}

  // ── 6. window.chrome stub ────────────────────────────────────────────────
  // Google sign-in probes window.chrome.runtime — Electron's stub is incomplete
  // which triggers the "browser may not be secure" block. Provide a fuller stub.
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        id: undefined,
        connect: function() {},
        sendMessage: function() {},
        onMessage: { addListener: function() {}, removeListener: function() {} },
        onConnect: { addListener: function() {}, removeListener: function() {} },
      };
    }
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        getDetails: function() { return null; },
        getIsInstalled: function() { return false; },
        installState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      };
    }
    if (!window.chrome.csi) window.chrome.csi = function() { return { startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 }; };
    if (!window.chrome.loadTimes) window.chrome.loadTimes = function() { return { commitLoadTime: Date.now()/1000, connectionInfo: 'h2', finishDocumentLoadTime: 0, finishLoadTime: 0, firstPaintAfterLoadTime: 0, firstPaintTime: 0, navigationType: 'Other', npnNegotiatedProtocol: 'h2', requestTime: Date.now()/1000, startLoadTime: Date.now()/1000, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true }; };
  } catch(e) {}

})(${sessionNoise});
  `.trim()

  const script = document.createElement('script')
  script.textContent = code
  document.documentElement.appendChild(script)
  script.remove()
}

// ──────────────────────────────────────────────────────────────────────────────
// Cookie banner MutationObserver + polling (runs in preload/isolated world;
// clicking DOM buttons works across worlds)
// ──────────────────────────────────────────────────────────────────────────────
// ── CMP-specific selectors (tried first for reliability) ─────────────────────
const CMP_SELECTORS = [
  // OneTrust
  '#onetrust-reject-all-handler',
  'button#onetrust-reject-all-handler',
  // Cookiebot
  '#CybotCookiebotDialogBodyButtonDecline',
  'a#CybotCookiebotDialogBodyButtonDecline',
  // Usercentrics
  '[data-testid="uc-deny-all-button"]',
  // Didomi
  '#didomi-notice-disagree-button',
  // TrustArc
  '.truste_decline',
  // Osano
  '.osano-cm-denyAll',
  // Funding Choices / Google
  '[aria-label*="Reject all" i]',
  '[aria-label*="Deny all" i]',
  // Generic attribute-based
  'button[id*="decline" i]',
  'button[id*="deny" i]',
  'button[id*="reject" i]',
  'button[class*="decline" i]:not([class*="declineable"])',
  'button[class*="deny-all" i]',
  'button[class*="reject-all" i]',
]

// Button TEXT patterns — matches visible text of any button/link
// Intentionally broad to catch many languages and punctuation variants
const REJECT_TEXT = /^(reject(\s+all)?|decline(\s+all)?|deny(\s+all)?|no,?\s*thanks?|no\s+thank\s+you|refuse|not\s+now|maybe\s+later|skip|essential(\s+only)?|necessary(\s+only)?|save\s+&\s+exit|i\s+do\s+not\s+accept|i\s+refuse|continue\s+without(\s+accepting)?)$/i

// ── Selector for close/dismiss buttons inside modals ──────────────────────────
const MODAL_CLOSE_SELECTORS = [
  'button[aria-label*="close" i]:not([aria-label*="menu" i])',
  'button[aria-label*="dismiss" i]',
  'button[aria-label*="skip" i]',
  '[data-testid*="modal-close"]',
  '[data-testid*="close-button"]',
  '.modal__close',
  '.dialog__close',
  '[class*="CloseButton"]',
  '[class*="close-button"]',
  '[class*="modal-close"]'
]

// ── Text patterns that identify intrusive modals to auto-close ─────────────────
const INTRUSIVE_MODAL_TEXT = new RegExp(
  'sign.?in|log.?in|create.?account|membership|genius' +
  '|register.*save|save.*register' +
  '|subscribe.*unlock|free.?article.?limit|paywall|subscribe.?now|subscribe.?to.?continue' +
  '|newsletter.*sign.?up|turn.?off.?ad.?block' +
  // Push notification prompts
  '|push.?notification|allow.?notification|never.?miss.?a.?story|enable.?notification' +
  '|get.?notified|stay.?updated|breaking.?news.?alert',
  'i'
)

// ── Negative buttons inside any detected intrusive modal ──────────────────────
// Broader than CMP reject — also covers "No, Thanks", "Not now", "Skip", etc.
const MODAL_NEGATIVE_TEXT = /^(no,?\s*thanks?|no\s+thank\s+you|not\s+now|maybe\s+later|skip|cancel|close|dismiss|later|remind\s+me\s+later|don'?t\s+(allow|show|ask)|block|deny)$/i

function tryDismissSigninModal(): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], .modal, [class*="Modal"], [class*="Dialog"],' +
    '[class*="Overlay"], [class*="paywall"], [class*="subscribe"], [class*="newsletter"],' +
    '[class*="notification-prompt"], [class*="push-prompt"]'
  )).filter(el => el.offsetParent !== null && INTRUSIVE_MODAL_TEXT.test(el.textContent ?? ''))

  for (const dialog of dialogs) {
    // 1. Structural close selectors (aria-label, data-testid, class)
    for (const sel of MODAL_CLOSE_SELECTORS) {
      const btn = dialog.querySelector<HTMLElement>(sel)
      if (btn && btn.offsetParent !== null) { btn.click(); return true }
    }

    // 2. Negative-intent buttons by text ("No, Thanks", "Not now", "Skip", etc.)
    const btns = Array.from(dialog.querySelectorAll<HTMLElement>('button, [role="button"], a'))
    const negativeBtn = btns.find(b =>
      b.offsetParent !== null && MODAL_NEGATIVE_TEXT.test(b.textContent?.trim() ?? '')
    )
    if (negativeBtn) { negativeBtn.click(); return true }

    // 3. Last resort: X / × close icon button
    const closeBtn = btns.find(b => {
      const text = b.textContent?.trim() ?? ''
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase()
      return ['×', '✕', '✗', 'X', '✖'].includes(text) ||
             label.includes('close') || label.includes('dismiss')
    })
    if (closeBtn) { closeBtn.click(); return true }
  }
  return false
}

// Also hide full-page paywall overlays via CSS (e.g. New York Times, Washington Post)
function injectPaywallCSS(): void {
  const style = document.createElement('style')
  style.dataset.cleansurf = 'paywall-blocker'
  style.textContent = `
    /* Full-page subscribe overlays */
    [class*="paywall"],
    [class*="Paywall"],
    [id*="paywall"],
    [class*="subscribe-wall"],
    [class*="metered-content"],
    [class*="piano-offer"],
    [class*="tp-modal"],
    [class*="tp-backdrop"],
    /* Scroll-blocking overlays */
    body.is-paywall,
    body.paywall-active { overflow: auto !important; }
  `
  document.documentElement.appendChild(style)
}

function tryDismiss(): boolean {
  // Cookie CMPs
  for (const sel of CMP_SELECTORS) {
    const btn = document.querySelector<HTMLElement>(sel)
    if (btn && btn.offsetParent !== null) { btn.click(); return true }
  }
  const btns = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'))
  const target = btns.find(b => b.offsetParent !== null && REJECT_TEXT.test(b.textContent?.trim() ?? ''))
  if (target) { target.click(); return true }

  // Sign-in / marketing modals
  if (tryDismissSigninModal()) return true

  return false
}

function startCookieDismissal(): void {
  injectPaywallCSS()
  if (document.readyState !== 'loading') {
    tryDismiss()
  } else {
    document.addEventListener('DOMContentLoaded', () => tryDismiss(), { once: true })
  }

  // MutationObserver catches dynamically injected banners (SPAs, lazy loaders)
  const obs = new MutationObserver(() => tryDismiss())
  obs.observe(document.documentElement, { childList: true, subtree: true })

  // Fast polling for the first 5s (catches banners that delay their appearance)
  // then slower polling for up to 60s (catches consent walls that load after scroll/interaction)
  let n = 0
  const poll = setInterval(() => {
    tryDismiss()
    n++
    if (n >= 120) { clearInterval(poll); obs.disconnect() } // 120 × 500ms = 60s
  }, 500)
}

// ──────────────────────────────────────────────────────────────────────────────
// Boot sequence
// ──────────────────────────────────────────────────────────────────────────────
injectBlockingCSS()
injectMainWorld()
setTimeout(startCookieDismissal, 50)
