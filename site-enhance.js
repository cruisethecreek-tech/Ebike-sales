/* ─────────────────────────────────────────────────────────────────
 * Cruise the Creek — site-wide UX/UI polish
 *
 * Drop-in companion to cms-loader.js. Loaded on every page, injects
 * shared styling + behaviour without per-page boilerplate.
 *
 * What it does:
 *
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

    /* View Transitions API — Chrome/Edge/Safari pick this up; others ignore. */
    '@view-transition{navigation:auto}',
    '::view-transition-old(root),::view-transition-new(root){animation-duration:.32s}',

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

  /* ── Boot ─────────────────────────────────────────── */

  function boot() {
    injectCSS();
    ensureStickyCTA();
    setupFadeIns();
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
