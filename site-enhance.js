/* ─────────────────────────────────────────────────────────────────
 * Cruise the Creek — site-wide UX/UI polish
 *
 * Drop-in companion to cms-loader.js. Loaded on every page, injects
 * shared styling + behaviour without per-page boilerplate.
 *
 * What it does:
 *
 *   0. Google Analytics 4 — loads gtag.js and fires the initial
 *      page_view. Skipped if Do Not Track is set. Salespro and the
 *      admin pages (invoice, balance, migrate-images) don't load this
 *      script and so are not tracked here — salespro inlines its own
 *      GA4 snippet.
 *   1. Custom focus rings — keyboard-only, on-brand tan.
 *   2. Cross-page View Transitions — smooth fade between navigations
 *      in browsers that support the API (no-op elsewhere).
 *   3. Animated topographic background — the existing .hero-topo SVG
 *      gets a slow drift so the hero doesn't feel static. Honors
 *      prefers-reduced-motion.
 *   4. Skeleton loader CSS classes (.skeleton, .skeleton-card,
 *      .skeleton-text) for shimmer placeholders during data load.
 *   5. Scroll-triggered fade-ins — elements with class .fade-in slide
 *      and fade up as they enter view. IntersectionObserver-driven,
 *      one-shot.
 *   6. Sticky mobile CTA — bottom-of-screen Book/Text bar on phones
 *      only. Per-page overrides via <body> data attributes:
 *        data-no-sticky-cta              hide it on this page
 *        data-cta-book-url   / -label    primary action
 *        data-cta-text-url   / -label    secondary action
 *
 * No public API surface is required for typical usage — including the
 * script is enough.
 * ──────────────────────────────────────────────────────────────── */

/* ── 0. Google Analytics 4 ───────────────────────────────────────
 * Async loader for the public-site GA4 property. Default
 * Enhanced Measurement (configured in the GA4 admin) covers
 * page_view, scroll, outbound clicks, file downloads, video plays,
 * and site search automatically — no custom events needed for the
 * "who visited, what did they look at, how long did they stay"
 * questions the dashboard answers. Initialized before any other
 * site-enhance logic so the page_view timestamp is accurate. */
(function loadGA4() {
  var MID = 'G-Y201WP8N0S';
  // Honor Do Not Track. DNT signal is fading from modern browsers
  // (Safari removed it, Chrome never honored it) but it's a cheap
  // gesture of respect for visitors who explicitly opted out.
  var dnt = (typeof navigator !== 'undefined') && (
    navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' ||
    navigator.msDoNotTrack === '1' ||
    (typeof window !== 'undefined' && window.doNotTrack === '1')
  );
  if (dnt) return;
  if (typeof document === 'undefined' || window.gtag) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MID);
})();

(function (root) {
  'use strict';

  var BRAND = {
    forest: '#2D4A32',
    dark:   '#1a2e1c',
    tan:    '#C9A96E',
    cream:  '#F5F0E8',
    creamW: '#fbf7ef',
  };

  var DEFAULT_CTA = {
    bookUrl:   'https://www.cruisethecreek.com/book-a-rental',
    bookLabel: 'Book a Ride',
    textUrl:   'sms:3304069686',
    textLabel: 'Text us',
  };

  /* ── 1-5: shared CSS injected into <head> ─────────── */

  var CSS = [
    /* Custom on-brand focus rings, keyboard-only. */
    ':focus{outline:none}',
    ':focus-visible{outline:2px solid ' + BRAND.tan + ';outline-offset:2px;border-radius:3px}',

    /* View Transitions API — DISABLED. We previously opted into
       cross-document transitions (`@view-transition{navigation:auto}`),
       but cruisethecreek.com is served through a Wix-proxy → Pages.dev
       chain that redirects mid-navigation. The browser then aborts the
       transition and throws an uncaught "AbortError: Transition was
       skipped" — worse, on some Chromium builds the ::view-transition-new
       snapshot stays pinned at opacity 0, leaving visitors on a blank
       page below the nav (the bikes, trust strip, and CMS-driven hero
       look gone). Falling back to a hard nav across pages eliminates
       both the console error and the blank-render symptom. */

    /* Animated topo drift on hero backgrounds. */
    '.hero-topo{animation:hero-topo-drift 80s ease-in-out infinite alternate;will-change:transform}',
    '@keyframes hero-topo-drift{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(-2.5%,1%,0)}}',

    /* Skeleton placeholders for content that's still loading. */
    '.skeleton{position:relative;overflow:hidden;background:linear-gradient(135deg,' + BRAND.creamW + ',' + BRAND.cream + ');border-radius:6px}',
    '.skeleton::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-100%);animation:skel-shimmer 1.6s ease-in-out infinite}',
    '@keyframes skel-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}',
    '.skeleton-card{aspect-ratio:4/5;width:100%}',
    '.skeleton-text{height:.85rem;margin-bottom:.45rem;border-radius:4px}',
    '.skeleton-text.w-90{width:90%}.skeleton-text.w-70{width:70%}.skeleton-text.w-50{width:50%}',

    /* Scroll fade-in. */
    '.fade-in{opacity:0;transform:translateY(18px);transition:opacity .85s cubic-bezier(.2,.8,.2,1),transform .85s cubic-bezier(.2,.8,.2,1)}',
    '.fade-in.is-visible{opacity:1;transform:translateY(0)}',

    /* Sticky mobile CTA bar. */
    '.sticky-cta{position:fixed;bottom:0;left:0;right:0;z-index:90;' +
      'background:rgba(245,240,232,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
      'border-top:1px solid rgba(0,0,0,.08);padding:10px 12px env(safe-area-inset-bottom);' +
      'display:flex;gap:8px;transform:translateY(110%);transition:transform .35s cubic-bezier(.4,0,.2,1);' +
      'box-shadow:0 -8px 24px rgba(0,0,0,.06)}',
    '.sticky-cta.is-show{transform:translateY(0)}',
    '.sticky-cta a{flex:1;text-align:center;padding:13px 14px;border-radius:6px;' +
      "font-family:'DM Sans',system-ui,sans-serif;font-size:.82rem;font-weight:800;" +
      'letter-spacing:.06em;text-transform:uppercase;text-decoration:none;' +
      'transition:background .15s ease,color .15s ease,transform .15s ease}',
    '.sticky-cta .scta-secondary{background:rgba(255,255,255,.92);border:1px solid rgba(45,74,50,.18);color:' + BRAND.forest + '}',
    '.sticky-cta .scta-secondary:hover{background:#fff;transform:translateY(-1px)}',
    '.sticky-cta .scta-primary{background:' + BRAND.forest + ';color:#fff;box-shadow:0 4px 14px rgba(26,46,28,.25)}',
    '.sticky-cta .scta-primary:hover{background:' + BRAND.dark + ';transform:translateY(-1px)}',
    '.sticky-cta .scta-arrow{margin-left:6px;display:inline-block;transition:transform .15s ease}',
    '.sticky-cta .scta-primary:hover .scta-arrow{transform:translateX(2px)}',
    'body.has-sticky-cta{padding-bottom:calc(74px + env(safe-area-inset-bottom))}',
    '@media(min-width:768px){.sticky-cta{display:none}body.has-sticky-cta{padding-bottom:0}}',

    /* Reduced motion — kill animations across the board. */
    '@media(prefers-reduced-motion:reduce){' +
      '.hero-topo{animation:none}' +
      '.skeleton::after{animation:none}' +
      '.fade-in{opacity:1;transform:none;transition:none}' +
      '.sticky-cta{transition:none}' +
    '}',
  ].join('');

  function injectCSS() {
    if (document.head.querySelector('style[data-site-enhance]')) return;
    var s = document.createElement('style');
    s.setAttribute('data-site-enhance', '1');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── 6: Sticky mobile CTA ─────────────────────────── */

  function attr(name, fallback) {
    var v = document.body && document.body.getAttribute(name);
    return (v && v.trim()) || fallback;
  }

  function ensureStickyCTA() {
    if (!document.body) return;
    if (document.body.hasAttribute('data-no-sticky-cta')) return;
    if (document.getElementById('sticky-cta')) return;

    var bookUrl   = attr('data-cta-book-url',   DEFAULT_CTA.bookUrl);
    var bookLabel = attr('data-cta-book-label', DEFAULT_CTA.bookLabel);
    var textUrl   = attr('data-cta-text-url',   DEFAULT_CTA.textUrl);
    var textLabel = attr('data-cta-text-label', DEFAULT_CTA.textLabel);

    var bar = document.createElement('div');
    bar.className = 'sticky-cta';
    bar.id = 'sticky-cta';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Quick actions');
    bar.innerHTML =
      '<a class="scta-secondary" href="' + textUrl + '">' + textLabel + '</a>' +
      '<a class="scta-primary" href="' + bookUrl + '" target="_blank" rel="noopener">' +
        bookLabel + '<span class="scta-arrow">→</span>' +
      '</a>';
    document.body.appendChild(bar);
    document.body.classList.add('has-sticky-cta');
    // Reveal after a tick so the bar slides in instead of popping in.
    setTimeout(function () { bar.classList.add('is-show'); }, 280);
  }

  /* ── 5: Scroll fade-in observer ───────────────────── */

  function setupFadeIns() {
    var els = document.querySelectorAll('.fade-in');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      // Old browsers — just reveal everything.
      Array.prototype.forEach.call(els, function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  /* ── HTTPS upgrade for sheet-driven image URLs ────── */

  // The Apps Script sheet stores some image URLs as
  //   http://ebike-sales.pages.dev/images/foo.jpg
  // Chrome upgrades these to HTTPS automatically but logs a noisy
  // Mixed-Content warning per image — and Safari/older WebKit don't
  // upgrade at all, which fails the image entirely. Normalize at the
  // DOM layer so the inline render code on each brand page (and any
  // future CMS surface) doesn't have to remember to do it.
  var HTTP_PREFIX = 'http://ebike-sales.pages.dev/';
  var HTTPS_PREFIX = 'https://ebike-sales.pages.dev/';

  function upgradeImage(img) {
    var src = img.getAttribute('src');
    if (src && src.indexOf(HTTP_PREFIX) === 0) {
      img.setAttribute('src', HTTPS_PREFIX + src.slice(HTTP_PREFIX.length));
    }
  }

  function upgradeAllImages(root) {
    var imgs = (root || document).querySelectorAll('img[src^="' + HTTP_PREFIX + '"]');
    Array.prototype.forEach.call(imgs, upgradeImage);
  }

  function watchForLateImages() {
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'IMG') upgradeImage(n);
          else if (n.querySelectorAll) upgradeAllImages(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ── Boot ─────────────────────────────────────────── */

  function boot() {
    injectCSS();
    ensureStickyCTA();
    setupFadeIns();
    upgradeAllImages(document);
    watchForLateImages();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose a tiny re-scan hook for pages that inject .fade-in nodes
  // dynamically after the initial pass (e.g., CMS-rendered cards).
  root.siteEnhance = { rescanFadeIns: setupFadeIns };

})(typeof window !== 'undefined' ? window : this);

/* ─────────────────────────────────────────────────────────────────
 * cmsBoot — inlined from the former cms-loader.js
 *
 * Originally lived in its own file, but cruisethecreek.com (Wix
 * proxy → Pages.dev) was returning HTTP 500 for `/cms-loader.js`
 * — apparently a route conflict with Wix's built-in CMS path
 * handler. Every page that depended on the script then died with
 * `ReferenceError: cmsBoot is not defined` and never rendered its
 * Sheet content (so visitors saw a blank or static-fallback page).
 *
 * Solution: ship the same logic from site-enhance.js, which does
 * load cleanly across the proxy. The two IIFEs are independent —
 * combining them in one file changes nothing about the runtime
 * behaviour, only the filename the browser asks for.
 *
 * Public surface (unchanged): window.cmsBoot, window.showCmsLoader,
 * window.hideCmsLoader. ?refresh=1 still bypasses the TTL.
 * ──────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var DEFAULT_TTL_MS = 60 * 1000;
  var LOGO_SRC = 'BlackonTransparent.png';
  var LOADER_LABEL = 'Updating';

  var loaderInjected = false;
  var hideTimer = null;

  function injectLoaderStyles() {
    var css =
      '.cms-loader{position:fixed;bottom:18px;right:18px;z-index:9999;' +
      'background:rgba(255,255,255,.96);padding:8px 14px 8px 8px;' +
      'border-radius:999px;box-shadow:0 8px 24px rgba(45,74,50,.2);' +
      'display:flex;align-items:center;gap:10px;' +
      'opacity:0;transform:translateY(8px);pointer-events:none;' +
      'transition:opacity .25s ease,transform .25s ease;' +
      "font-family:'DM Sans',system-ui,sans-serif;font-size:.74rem;" +
      'font-weight:700;color:#2D4A32;letter-spacing:.08em;' +
      'text-transform:uppercase}' +
      '.cms-loader.is-show{opacity:1;transform:translateY(0)}' +
      '.cms-loader img{width:26px;height:26px;display:block;' +
      'animation:cms-pulse 1.4s ease-in-out infinite}' +
      '@keyframes cms-pulse{' +
      '0%,100%{transform:scale(1);opacity:.85}' +
      '50%{transform:scale(1.1);opacity:1}}' +
      '@media (max-width:480px){' +
      '.cms-loader{bottom:12px;right:12px;padding:6px 12px 6px 6px;font-size:.68rem}' +
      '.cms-loader img{width:22px;height:22px}}' +
      '@media (prefers-reduced-motion:reduce){' +
      '.cms-loader{transition:opacity .15s linear;transform:none}' +
      '.cms-loader.is-show{transform:none}' +
      '.cms-loader img{animation:none}}';
    var style = document.createElement('style');
    style.setAttribute('data-cms-loader', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectLoaderDom() {
    var el = document.createElement('div');
    el.className = 'cms-loader';
    el.id = 'cms-loader';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<img src="' + LOGO_SRC + '" alt=""><span>' + LOADER_LABEL + '</span>';
    (document.body || document.documentElement).appendChild(el);
  }

  function ensureLoader() {
    if (loaderInjected) return;
    loaderInjected = true;
    injectLoaderStyles();
    if (document.body) {
      injectLoaderDom();
    } else {
      document.addEventListener('DOMContentLoaded', injectLoaderDom, { once: true });
    }
  }

  function showCmsLoader() {
    ensureLoader();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    var el = document.getElementById('cms-loader');
    if (!el) {
      document.addEventListener('DOMContentLoaded', showCmsLoader, { once: true });
      return;
    }
    requestAnimationFrame(function () { el.classList.add('is-show'); });
  }

  function hideCmsLoader() {
    var el = document.getElementById('cms-loader');
    if (!el) return;
    hideTimer = setTimeout(function () { el.classList.remove('is-show'); }, 120);
  }

  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      var p = raw ? JSON.parse(raw) : null;
      return (p && typeof p === 'object') ? p : null;
    } catch (e) { return null; }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ _ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function unwrapCache(wrapped) {
    if (!wrapped) return null;
    if (wrapped.data && wrapped._ts) return wrapped.data;
    if (wrapped._ts && !wrapped.data) return null;
    return wrapped;
  }

  function isCacheFresh(wrapped, ttlMs) {
    return !!(wrapped && wrapped._ts && (Date.now() - wrapped._ts < ttlMs));
  }

  function bypassCacheRequested() {
    return /[?&]refresh=1\b/.test(location.search);
  }

  function cmsBoot(opts) {
    if (!opts || typeof opts.onApply !== 'function' || !opts.url || !opts.key) {
      console.warn('[cms] cmsBoot called without {key, url, onApply}');
      return;
    }
    var ttlMs   = opts.ttlMs || DEFAULT_TTL_MS;
    var wrapped = readCache(opts.key);
    var cached  = unwrapCache(wrapped);
    if (cached) {
      try { opts.onApply(cached); }
      catch (e) { console.warn('[cms] onApply (cached) failed:', e); }
    }

    if (!bypassCacheRequested() && isCacheFresh(wrapped, ttlMs)) {
      return;
    }

    showCmsLoader();
    fetch(opts.url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (remote) {
        if (!remote || typeof remote !== 'object') return;
        writeCache(opts.key, remote);
        if (cached) {
          try {
            if (JSON.stringify(remote) === JSON.stringify(cached)) return;
          } catch (e) { /* fall through to re-render */ }
        }
        try { opts.onApply(remote); }
        catch (e) { console.warn('[cms] onApply (remote) failed:', e); }
      })
      .catch(function (err) {
        console.warn('[cms]', opts.key, 'fetch failed:', err);
      })
      .then(hideCmsLoader, hideCmsLoader);
  }

  root.cmsBoot         = cmsBoot;
  root.showCmsLoader   = showCmsLoader;
  root.hideCmsLoader   = hideCmsLoader;

})(typeof window !== 'undefined' ? window : this);
