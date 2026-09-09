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

/* ─────────────────────────────────────────────────────────────────
 * Discontinued-bike safety net.
 *
 * The storefront pages (shop, heybike, velotric, mooncool, jasion,
 * quiz) hide a bike when its name is in localStorage's
 * `ctc_discontinued_names`. That list is published by the Sales Pro
 * admin — but localStorage is per-origin and per-browser, so an
 * admin's discontinue never reaches customers (or even the same
 * person on the live cruisethecreek.com domain). The sheet's
 * `discontinued` column is the only other signal, and that write is a
 * best-effort no-cors call that can silently fail. Result: a bike you
 * discontinued can keep showing for everyone.
 *
 * This baseline is committed in code, so it ships to every visitor on
 * every domain and is merged into the very list the filters already
 * read — guaranteeing these models stay hidden store-wide regardless
 * of localStorage or the sheet. It runs before any catalog render
 * (this file loads ahead of the inline page scripts).
 *
 * Entries must match the storefront bike `name`, lowercased. To bring
 * a bike back, delete it from this list. ──────────────────────────── */
(function discontinuedBaseline() {
  var BASELINE = [
    'cityrun'   // Heybike Cityrun — discontinued
  ];
  try {
    var key = 'ctc_discontinued_names';
    var current = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(current)) current = [];
    var merged = current.slice();
    for (var i = 0; i < BASELINE.length; i++) {
      var n = String(BASELINE[i] || '').toLowerCase().trim();
      if (n && merged.indexOf(n) === -1) merged.push(n);
    }
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (e) { /* localStorage blocked — the sheet flag still applies */ }
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
    bookUrl:   'https://book.peek.com/s/57e3b62e-4f48-4cc4-8876-7b79f4c11baa/Zd03p',
    bookLabel: 'Book a Ride',
    textUrl:   'sms:3304069686',
    textLabel: 'Text us',
  };

  /* ── Site menu config ─────────────────────────────────
   * One menu for the whole site. Top-level entries are either a direct link
   * ({label,url}) or an expandable section ({label, items:[...]}). The section
   * containing the current page auto-expands. Edit here only. */
  var NAV_MENU = [
    { label: 'Home', url: 'index.html' },
    { label: 'Rentals', items: [
      { label: 'Book Bears Den (Youngstown)', url: 'adventures.html' },
      { label: 'Book Kirk Road (Canfield)',   url: 'trailside.html' },
      { label: 'Book Long Term',              url: 'long-term-rental.html' },
      { label: 'Apply for Rent-to-Own',       url: 'bridge-the-gap.html' },
    ]},
    { label: 'Shop', items: [
      { label: 'Shop E-Bikes',     url: 'shop.html' },
      { label: 'E-Bike Quiz',      url: 'quiz.html' },
      { label: 'Shop Accessories', url: 'accessories.html' },
      { label: 'Shop Apparel',     url: 'apparel.html' },
    ]},
    { label: 'Services', items: [
      { label: 'Creek Ready Package',  url: 'creek-ready.html' },
      { label: 'Creek Ready Tune-Ups', url: 'tune-ups.html' },
      { label: 'Video Diagnostic',     url: 'video-diagnostics.html' },
      { label: 'Repair Intake',        url: 'repair-intake.html' },
    ]},
    { label: 'Test Ride', url: 'https://book.peek.com/s/57e3b62e-4f48-4cc4-8876-7b79f4c11baa/17Aw9' },
    { label: 'Creek Life', items: [
      { label: 'Creek Life Blog', url: 'creek-life-blog.html' },
      { label: 'Our Story',       url: 'our-story.html' },
      { label: 'Events',          url: 'events.html' },
      { label: 'Donate',          url: 'donate.html' },
      { label: 'Join the Team',   url: 'join-the-team.html' },
      { label: 'FAQs',            url: 'faqs.html' },
    ]},
  ];

  function currentPageFile() {
    var p = (location.pathname || '').split('/').pop();
    return (p && p.indexOf('.') !== -1) ? p.toLowerCase() : 'index.html';
  }

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

    /* ── Shared section-aware menu (one nav system site-wide) ── */
    '.ctc-menu-btn{position:fixed;top:13px;right:16px;z-index:1200;width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 10px rgba(0,0,0,.12);cursor:pointer;color:' + BRAND.forest + ';-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
    '.ctc-menu-btn svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round}',
    '.ctc-menu-overlay{position:fixed;inset:0;z-index:1190;background:rgba(26,46,28,.4);opacity:0;pointer-events:none;transition:opacity .25s ease}',
    '.ctc-menu-overlay.is-open{opacity:1;pointer-events:auto}',
    ".ctc-menu-panel{position:fixed;top:0;right:0;z-index:1210;height:100%;width:min(84vw,320px);background:#fff;box-shadow:-12px 0 34px rgba(0,0,0,.22);transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;padding:16px;overflow-y:auto;font-family:'DM Sans',system-ui,sans-serif}",
    '.ctc-menu-panel.is-open{transform:translateX(0)}',
    '.ctc-menu-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:2px 6px}',
    ".ctc-menu-title{font-family:'Bebas Neue',sans-serif;font-size:1.45rem;letter-spacing:.03em;color:" + BRAND.forest + "}",
    '.ctc-menu-close{background:none;border:0;font-size:1.7rem;line-height:1;color:#4a4a4a;cursor:pointer;padding:2px 8px}',
    '.ctc-menu-link,.ctc-menu-grouptoggle{display:flex;align-items:center;width:100%;padding:13px 12px;border:0;background:none;border-radius:7px;color:#1a1a1a;text-decoration:none;font-weight:700;font-size:.92rem;letter-spacing:.02em;cursor:pointer;text-align:left;transition:background .15s ease,color .15s ease;font-family:inherit}',
    '.ctc-menu-grouptoggle{justify-content:space-between;text-transform:uppercase;letter-spacing:.06em;font-size:.82rem;color:' + BRAND.forest + '}',
    '.ctc-menu-link:hover,.ctc-menu-grouptoggle:hover,.ctc-menu-sub:hover{background:rgba(45,74,50,.07);color:' + BRAND.forest + '}',
    '.ctc-menu-caret{transition:transform .2s ease;font-size:.7rem;opacity:.7}',
    '.ctc-menu-group.is-expanded .ctc-menu-caret{transform:rotate(180deg)}',
    '.ctc-menu-sublist{display:none;padding:2px 0 6px 8px}',
    '.ctc-menu-group.is-expanded .ctc-menu-sublist{display:block}',
    '.ctc-menu-sub{display:block;padding:11px 12px;border-radius:7px;color:#1a1a1a;text-decoration:none;font-weight:600;font-size:.9rem;transition:background .15s ease,color .15s ease}',
    '.ctc-menu-sub.is-active,.ctc-menu-link.is-active{background:' + BRAND.forest + ';color:#fff}',
    /* Retire the legacy per-page navs — one shared menu drives navigation now. */
    '.top-nav,.ctc-top-nav,.nav-links,#navToggle,.nav-toggle,.ctc-nav-toggle,.mobile-toggle{display:none!important}',

    /* ── Reusable scrolling marquee heading — add data-marquee to any
          heading and it scrolls. Honors prefers-reduced-motion; pauses on
          hover. min-width:0 guards flex parents from the nowrap content. */
    '.ctc-mq{display:block;overflow:hidden;white-space:nowrap;max-width:100%;min-width:0;contain:inline-size}',
    '.ctc-mq__track{display:inline-flex;will-change:transform;animation:ctc-mq-scroll linear infinite}',
    '.ctc-mq__half{display:inline-flex;flex:0 0 auto}',
    '.ctc-mq:hover .ctc-mq__track{animation-play-state:paused}',
    '@keyframes ctc-mq-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
    '@media(prefers-reduced-motion:reduce){.ctc-mq__track{animation:none}}',
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

  /* ── Section-aware menu injector ──────────────────── */

  function injectNavMenu() {
    if (!document.body) return;
    if (document.body.hasAttribute('data-no-site-menu')) return;
    if (document.getElementById('ctc-menu-btn')) return;

    var cur = currentPageFile();
    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
    function extAttr(url){ return /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : ''; }

    var html = NAV_MENU.map(function (entry) {
      if (entry.url) {
        var active = String(entry.url).toLowerCase() === cur ? ' is-active' : '';
        return '<a class="ctc-menu-link' + active + '" href="' + esc(entry.url) + '"' + extAttr(entry.url) + '>' + esc(entry.label) + '</a>';
      }
      var items = entry.items || [];
      var hasActive = items.some(function (it) { return String(it.url).toLowerCase() === cur; });
      var subs = items.map(function (it) {
        var a = String(it.url).toLowerCase() === cur ? ' is-active' : '';
        return '<a class="ctc-menu-sub' + a + '" href="' + esc(it.url) + '"' + extAttr(it.url) + '>' + esc(it.label) + '</a>';
      }).join('');
      return '<div class="ctc-menu-group' + (hasActive ? ' is-expanded' : '') + '">' +
        '<button type="button" class="ctc-menu-grouptoggle" aria-expanded="' + (hasActive ? 'true' : 'false') + '">' +
        esc(entry.label) + '<span class="ctc-menu-caret" aria-hidden="true">▾</span></button>' +
        '<div class="ctc-menu-sublist">' + subs + '</div></div>';
    }).join('');

    var btn = document.createElement('button');
    btn.className = 'ctc-menu-btn';
    btn.id = 'ctc-menu-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';

    var overlay = document.createElement('div');
    overlay.className = 'ctc-menu-overlay';

    var panel = document.createElement('nav');
    panel.className = 'ctc-menu-panel';
    panel.setAttribute('aria-label', 'Site menu');
    panel.innerHTML =
      '<div class="ctc-menu-head"><span class="ctc-menu-title">Menu</span>' +
      '<button class="ctc-menu-close" type="button" aria-label="Close menu">&times;</button></div>' +
      html;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    document.body.appendChild(btn);

    function open()  { panel.classList.add('is-open'); overlay.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    function close() { panel.classList.remove('is-open'); overlay.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', open);
    overlay.addEventListener('click', close);
    panel.querySelector('.ctc-menu-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    // Expand/collapse sections.
    panel.querySelectorAll('.ctc-menu-grouptoggle').forEach(function (tg) {
      tg.addEventListener('click', function () {
        var group = tg.parentNode;
        var open = group.classList.toggle('is-expanded');
        tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
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

  /* ── Reusable scrolling marquee ───────────────────────
   * Any element with [data-marquee] becomes a horizontal scrolling
   * heading. Works on plain or CMS-hydrated headings: a per-element
   * MutationObserver rebuilds the marquee whenever the source text is
   * replaced (e.g. applyCMS sets textContent). The observer is paused
   * during our own DOM writes so we never loop. aria-label carries the
   * real text so screen readers don't hear the repeats. */
  function buildMarquee(el) {
    var obs = el.__mqObs;
    if (obs) obs.disconnect();
    // Source text: the heading's own text, unless it's currently our marquee
    // (then fall back to the remembered text).
    var text = el.querySelector('.ctc-mq__track')
      ? (el.getAttribute('data-mq-text') || '')
      : (el.textContent || '').trim();
    if (text) {
      el.setAttribute('data-mq-text', text);
      el.setAttribute('aria-label', text);
      el.classList.add('ctc-mq');
      el.textContent = '';
      var track = document.createElement('span');
      track.className = 'ctc-mq__track';
      track.setAttribute('aria-hidden', 'true');
      var half = document.createElement('span');
      half.className = 'ctc-mq__half';
      track.appendChild(half);
      el.appendChild(track);
      var unit = text + '  •  ';
      var guard = 0;
      do {
        var s = document.createElement('span');
        s.textContent = unit;
        half.appendChild(s);
        guard++;
      } while (half.scrollWidth < (el.clientWidth + 40) && guard < 60);
      track.appendChild(half.cloneNode(true)); // 2 identical halves → seamless -50% loop
      track.style.animationDuration = Math.max(8, Math.round(half.scrollWidth / 55)) + 's';
    }
    if (obs) obs.observe(el, { childList: true, characterData: true, subtree: true });
  }

  function setupMarquees(root) {
    var els = (root || document).querySelectorAll('[data-marquee]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.__mqInit) continue;
      el.__mqInit = true;
      if (typeof MutationObserver !== 'undefined') {
        // Rebuild when something external (CMS) replaces the heading text.
        el.__mqObs = new MutationObserver((function (target) {
          return function () { buildMarquee(target); };
        })(el));
      }
      buildMarquee(el);
    }
  }

  /* ── 7. Seasonal & Holiday Personality Theme ────────── */
  var SEASONS = {
    autumn: {
      key: 'autumn',
      name: 'Autumn Fall',
      icon: '🍂',
      banner: '🍂 Autumn Trail Season in Mill Creek Park · Crisp air, golden leaves & electrified rides 🍁',
      color: '#C9A96E',
      particles: ['🍂', '🍁', '🍃', '🌰'],
    },
    winter: {
      key: 'winter',
      name: 'Winter Holiday',
      icon: '❄️',
      banner: '❄️ Winter & Holiday Season · Ride bright, stay warm & store batteries indoors 🎄',
      color: '#D4AF37',
      particles: ['❄️', '✨', '🌲', '⭐'],
    },
    spring: {
      key: 'spring',
      name: 'Spring Bloom',
      icon: '🌸',
      banner: '🌸 Spring Trail Thaw · Mill Creek Park In Bloom · Tune-Up Time 🌱',
      color: '#6B8F71',
      particles: ['🌸', '🌱', '🌼', '🍃'],
    },
    summer: {
      key: 'summer',
      name: 'Summer Sun',
      icon: '☀️',
      banner: '☀️ Summer Riding Season · Lake Breeze & Shaded MetroParks Trails 🌊',
      color: '#F59E0B',
      particles: ['☀️', '✨', '🌊', '🚲'],
    },
  };

  function getAutoSeason() {
    var m = new Date().getMonth(); // 0-11
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
  }

  function setupSeasonalTheme() {
    if (!document.body || document.getElementById('ctc-season-container')) return;

    var saved = null;
    try { saved = localStorage.getItem('ctc_season_theme'); } catch(e) {}
    var currentKey = (saved && SEASONS[saved]) ? saved : getAutoSeason();
    var current = SEASONS[currentKey] || SEASONS.autumn;

    // Inject seasonal CSS
    var seasonCss = [
      '@keyframes ctc-particle-fall {',
      '  0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 0; }',
      '  15% { opacity: 0.85; }',
      '  85% { opacity: 0.85; }',
      '  100% { transform: translate3d(80px, 100vh, 0) rotate(360deg); opacity: 0; }',
      '}',
      '.ctc-particle { position: fixed; top: -30px; pointer-events: none; z-index: 999; user-select: none; font-size: 1.2rem; animation: ctc-particle-fall linear infinite; }',
      '.ctc-season-banner { position: relative; z-index: 110; background: linear-gradient(135deg, #1A2E1C 0%, #2D4A32 100%); color: #F5F0E8; border-bottom: 2px solid ' + current.color + '; padding: 7px 16px; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; justify-content: center; text-align: center; gap: 8px; font-family: "DM Sans", system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }',
      '.ctc-season-banner a { color: ' + current.color + '; text-decoration: underline; margin-left: 6px; }',
      '.ctc-season-banner-close { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; padding: 2px 6px; font-size: 1rem; line-height: 1; margin-left: 8px; }',
      '.ctc-season-banner-close:hover { color: #fff; }',
      '.ctc-season-pill { position: fixed; bottom: 18px; left: 18px; z-index: 9998; background: rgba(255,255,255,0.94); border: 1px solid rgba(45,74,50,0.25); border-radius: 999px; padding: 6px 12px; font-size: 0.72rem; font-weight: 800; color: #1A2E1C; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: transform 0.15s ease, background 0.15s ease; font-family: "DM Sans", sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }',
      '.ctc-season-pill:hover { transform: translateY(-1px); background: #ffffff; }',
      '@media (max-width: 767px) { .ctc-season-pill { bottom: calc(74px + env(safe-area-inset-bottom, 0px) + 8px); left: 12px; padding: 5px 10px; font-size: 0.68rem; } }',
      '.ctc-season-menu { position: fixed; bottom: 58px; left: 18px; z-index: 9999; background: #ffffff; border: 1.5px solid #C9A96E; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.18); padding: 8px; display: none; flex-direction: column; gap: 4px; width: 210px; font-family: "DM Sans", sans-serif; }',
      '@media (max-width: 767px) { .ctc-season-menu { bottom: calc(120px + env(safe-area-inset-bottom, 0px)); left: 12px; } }',
      '.ctc-season-menu.is-open { display: flex; }',
      '.ctc-season-opt { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; border: none; background: none; font-size: 0.78rem; font-weight: 700; color: #1A1A1A; cursor: pointer; text-align: left; transition: background 0.15s ease; width: 100%; font-family: inherit; }',
      '.ctc-season-opt:hover { background: #F5F0E8; color: #2D4A32; }',
      '.ctc-season-opt.is-active { background: #2D4A32; color: #ffffff; }',
      '@media (prefers-reduced-motion: reduce) { .ctc-particle { display: none !important; } }',
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.id = 'ctc-seasonal-css';
    styleEl.textContent = seasonCss;
    document.head.appendChild(styleEl);

    // Season container
    var container = document.createElement('div');
    container.id = 'ctc-season-container';

    // 1. Top Announcement Banner
    var banner = document.createElement('div');
    banner.className = 'ctc-season-banner';
    banner.innerHTML = '<span>' + current.banner + '</span><button type="button" class="ctc-season-banner-close" title="Dismiss banner">&times;</button>';
    banner.querySelector('.ctc-season-banner-close').addEventListener('click', function() {
      banner.style.display = 'none';
    });
    container.appendChild(banner);

    // 2. Interactive Season Switcher Pill & Menu
    var pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'ctc-season-pill';
    pill.innerHTML = '<span>' + current.icon + '</span> <span>' + current.name + '</span> <span style="font-size:0.65rem; opacity:0.7;">▾</span>';

    var menu = document.createElement('div');
    menu.className = 'ctc-season-menu';
    menu.innerHTML = [
      '<div style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:#6B8F71; padding:4px 8px; letter-spacing:0.06em;">Holiday &amp; Season Theme</div>',
      '<button type="button" data-season="autumn" class="ctc-season-opt' + (currentKey === 'autumn' ? ' is-active' : '') + '"><span>🍂 Autumn Fall</span>' + (currentKey === 'autumn' ? '✓' : '') + '</button>',
      '<button type="button" data-season="winter" class="ctc-season-opt' + (currentKey === 'winter' ? ' is-active' : '') + '"><span>❄️ Winter &amp; Holiday</span>' + (currentKey === 'winter' ? '✓' : '') + '</button>',
      '<button type="button" data-season="spring" class="ctc-season-opt' + (currentKey === 'spring' ? ' is-active' : '') + '"><span>🌸 Spring Bloom</span>' + (currentKey === 'spring' ? '✓' : '') + '</button>',
      '<button type="button" data-season="summer" class="ctc-season-opt' + (currentKey === 'summer' ? ' is-active' : '') + '"><span>☀️ Summer Sun</span>' + (currentKey === 'summer' ? '✓' : '') + '</button>',
      '<div style="border-top:1px solid #eee; margin:4px 0;"></div>',
      '<button type="button" data-season="auto" class="ctc-season-opt"><span>⚙️ Reset to Auto</span></button>',
    ].join('');

    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('is-open');
    });

    document.addEventListener('click', function(e) {
      if (!menu.contains(e.target) && e.target !== pill) {
        menu.classList.remove('is-open');
      }
    });

    menu.querySelectorAll('.ctc-season-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sKey = btn.getAttribute('data-season');
        if (sKey === 'auto') {
          try { localStorage.removeItem('ctc_season_theme'); } catch(e) {}
        } else {
          try { localStorage.setItem('ctc_season_theme', sKey); } catch(e) {}
        }
        menu.classList.remove('is-open');
        // Refresh season
        location.reload();
      });
    });

    container.appendChild(pill);
    container.appendChild(menu);

    // 3. Ambient Falling Particles (Subtle & gentle: 6 elements)
    var isReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!isReduced && current.particles && current.particles.length) {
      var particleBox = document.createElement('div');
      particleBox.id = 'ctc-particle-box';
      particleBox.setAttribute('aria-hidden', 'true');
      var pCount = 7;
      for (var i = 0; i < pCount; i++) {
        var p = document.createElement('div');
        p.className = 'ctc-particle';
        p.textContent = current.particles[i % current.particles.length];
        p.style.left = (Math.random() * 95) + 'vw';
        p.style.animationDuration = (8 + Math.random() * 8) + 's';
        p.style.animationDelay = (Math.random() * 6) + 's';
        p.style.opacity = (0.4 + Math.random() * 0.4).toFixed(2);
        particleBox.appendChild(p);
      }
      container.appendChild(particleBox);
    }

    // Insert banner at top of document
    if (document.body.firstChild) {
      document.body.insertBefore(container, document.body.firstChild);
    } else {
      document.body.appendChild(container);
    }
  }

  /* ── Boot ─────────────────────────────────────────── */

  function boot() {
    injectCSS();
    injectNavMenu();
    ensureStickyCTA();
    setupFadeIns();
    upgradeAllImages(document);
    watchForLateImages();
    setupMarquees(document);
    setupSeasonalTheme();
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
        if (typeof opts.onError === 'function') {
          try { opts.onError(err); } catch (e) { console.warn('[cms] onError failed:', e); }
        }
      })
      .then(hideCmsLoader, hideCmsLoader);
  }

  root.cmsBoot         = cmsBoot;
  root.showCmsLoader   = showCmsLoader;
  root.hideCmsLoader   = hideCmsLoader;

})(typeof window !== 'undefined' ? window : this);
