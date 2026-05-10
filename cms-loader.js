/* ─────────────────────────────────────────────────────────────────
 * Cruise the Creek — shared CMS loader + cache helper
 *
 * One script, included on every page that pulls content from the
 * Apps Script web app. Handles three concerns the pages used to
 * handle inline (and inconsistently):
 *
 *   1. localStorage cache, with a TTL so repeat visitors inside the
 *      window skip the network round-trip entirely (no flash).
 *   2. Identical-payload short-circuit so a fresh fetch that matches
 *      the cached payload doesn't trigger a phantom re-render.
 *   3. A subtle floating "Updating" chip with the brand logo so
 *      visitors see something is happening when the fetch is in
 *      flight (instead of a silent flash from cached → fresh value).
 *
 * Per-page usage:
 *
 *   <script src="cms-loader.js"></script>
 *   <script>
 *     cmsBoot({
 *       key: 'cms:PAGE:v1',
 *       url: 'https://script.google.com/.../exec?page=PAGE',
 *       onApply(data) {
 *         applyCMS(data);
 *         if (data.sections)  renderSections(data.sections);
 *         // …whatever this page renders from the payload…
 *       }
 *     });
 *   </script>
 *
 * Append ?refresh=1 to any page URL to bypass the TTL and force a
 * fresh fetch — useful when previewing sheet edits.
 * ──────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
  var LOGO_SRC = 'BlackonTransparent.png';
  var LOADER_LABEL = 'Updating';

  /* ── Loader chip (created lazily on first show) ────────────── */

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
      // Body not parsed yet (script is in <head>). Wait for it.
      document.addEventListener('DOMContentLoaded', injectLoaderDom, { once: true });
    }
  }

  function showCmsLoader() {
    ensureLoader();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    var el = document.getElementById('cms-loader');
    if (!el) {
      // DOM not ready yet — try again after parse.
      document.addEventListener('DOMContentLoaded', showCmsLoader, { once: true });
      return;
    }
    requestAnimationFrame(function () { el.classList.add('is-show'); });
  }

  function hideCmsLoader() {
    var el = document.getElementById('cms-loader');
    if (!el) return;
    // Tiny delay so a fast fetch still shows the chip for a moment —
    // less jarring than a single-frame flash.
    hideTimer = setTimeout(function () { el.classList.remove('is-show'); }, 120);
  }

  /* ── Cache + fetch boot ────────────────────────────────────── */

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
    // New format: { _ts, data }. Old format: payload at root (legacy
    // caches written before this helper existed). Detect old format by
    // the absence of _ts and the presence of any non-_ts key.
    if (wrapped.data && wrapped._ts) return wrapped.data;
    if (wrapped._ts && !wrapped.data) return null; // shouldn't happen
    return wrapped; // treat as legacy payload
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
      // Cache is fresh enough — skip the network round-trip entirely.
      return;
    }

    showCmsLoader();
    fetch(opts.url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (remote) {
        if (!remote || typeof remote !== 'object') return;
        writeCache(opts.key, remote);
        // If the freshly-fetched payload matches what we already
        // painted from cache, skip the re-render. Eliminates the
        // identical second-paint flicker.
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

  /* ── Public surface ────────────────────────────────────────── */

  root.cmsBoot         = cmsBoot;
  root.showCmsLoader   = showCmsLoader;
  root.hideCmsLoader   = hideCmsLoader;

})(typeof window !== 'undefined' ? window : this);
