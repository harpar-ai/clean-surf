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
const CMP_SELECTORS = [
  '#onetrust-reject-all-handler',
  '[data-testid="uc-deny-all-button"]',
  '#CybotCookiebotDialogBodyButtonDecline',
  '.truste_decline',
  '#didomi-notice-disagree-button',
  '.osano-cm-denyAll'
]
const REJECT_TEXT = /^(reject|decline|deny|no thanks|refuse|essential( only)?|necessary( only)?)$/i

// Close buttons for sign-in / membership / marketing modals
const SIGNIN_CLOSE_SELECTORS = [
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

// Text patterns that identify modals we want to auto-close
const INTRUSIVE_MODAL_TEXT = /sign.?in|log.?in|create.?account|membership|genius|register.*save|save.*register|subscribe.*unlock|free.?article.?limit|paywall|subscribe.?now|subscribe.?to.?continue|newsletter.*sign.?up|turn.?off.?ad.?block/i

function tryDismissSigninModal(): boolean {
  // Find visible modal/dialog overlays that contain intrusive content
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], .modal, [class*="Modal"], [class*="Dialog"], [class*="Overlay"], [class*="paywall"], [class*="subscribe"], [class*="newsletter"]'
  )).filter(el => el.offsetParent !== null && INTRUSIVE_MODAL_TEXT.test(el.textContent ?? ''))

  for (const dialog of dialogs) {
    // Look for a close/dismiss button within the modal
    for (const sel of SIGNIN_CLOSE_SELECTORS) {
      const btn = dialog.querySelector<HTMLElement>(sel)
      if (btn && btn.offsetParent !== null) { btn.click(); return true }
    }
    // Fallback: find an X or × button (common close icon patterns)
    const btns = Array.from(dialog.querySelectorAll<HTMLElement>('button'))
    const closeBtn = btns.find(b => {
      const text = b.textContent?.trim() ?? ''
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase()
      return text === '×' || text === '✕' || text === '✗' || text === 'X' ||
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
  const obs = new MutationObserver(() => tryDismiss())
  obs.observe(document.documentElement, { childList: true, subtree: true })
  let n = 0
  const poll = setInterval(() => { if (tryDismiss() || ++n > 40) { clearInterval(poll); obs.disconnect() } }, 500)
}

// ──────────────────────────────────────────────────────────────────────────────
// Boot sequence
// ──────────────────────────────────────────────────────────────────────────────
injectBlockingCSS()
injectMainWorld()
setTimeout(startCookieDismissal, 50)
