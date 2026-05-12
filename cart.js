/* ────────────────────────────────────────────────────────────────
   Cruise the Creek — shared cart widget.

   Drop this on any page where bikes or accessories can be added to
   a multi-item order:
     <script src="cart.js" defer></script>

   The widget injects its own CSS, a floating "cart" FAB at
   bottom-left (chatbot lives bottom-right), and a slide-in drawer
   with checkout. State persists across navigation and reloads via
   localStorage. Submit posts to the existing Apps Script endpoint
   under action=cartOrder, which emails salesteam@cruisethecreek.com
   and info@cruisethecreek.com.

   Public API (callable from page-level scripts):
     ctcCart.add({ kind, brand, name, category, price, configuration,
                   condition, qty })
     ctcCart.count()
     ctcCart.open()

   `configuration` is a free-form object — style/size/color for bikes,
   any descriptor pairs for accessories. Items with the same kind +
   brand + name + configuration signature dedupe into qty bumps.

   Drop the script and the FAB appears. Items added show a green
   pulse on the FAB to signal "in cart" without forcing the drawer.
   ──────────────────────────────────────────────────────────────── */

(function() {
  'use strict';
  if (window.ctcCart) return; // idempotent — only one cart per page

  const STORAGE_KEY = 'ctc_cart_v1';
  // Tech debt: site uses 3 Apps Script deployment URLs across different code paths.
  // This URL (AKfycbyxVMuF...) owns cartOrder/apparelOrder + getBikeInventory used by
  // brand pages. The CMS read + Bridge application live on AKfycbxjg2Zs...; admin
  // pages (balance, invoice, migrate-images) live on AKfycbxmz.... To unify, the .gs
  // source from the other two projects needs to be merged into this repo's
  // apps-script.gs, then one deployment URL swept everywhere.
  const AS_URL = 'https://script.google.com/macros/s/AKfycbyxVMuFEUeR8_YqM1VVnfPSVPnDhdCs_63dDthZ4jODlTDGQ-7yXSkQeYT-Ux0SM8tw/exec';

  // ── Styles ───────────────────────────────────────────────────
  const STYLES = `
.ctc-cart-fab{
  position:fixed;left:20px;bottom:calc(20px + env(safe-area-inset-bottom, 0px));
  z-index:9998;width:56px;height:56px;border-radius:50%;
  background:#2D4A32;color:#C9A96E;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 24px rgba(45,74,50,.32),0 2px 6px rgba(0,0,0,.18);
  transition:transform .25s ease, background .2s ease, opacity .25s ease;
  font-family:'DM Sans',-apple-system,system-ui,sans-serif;
}
.ctc-cart-fab:hover{transform:translateY(-2px);background:#1a2e1c}
.ctc-cart-fab svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2}
.ctc-cart-badge{
  position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;
  border-radius:11px;background:#C9A96E;color:#1a2e1c;font-size:.72rem;font-weight:800;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 2px #2D4A32;letter-spacing:.02em;
}
/* Hide the FAB entirely when the cart is empty — keeps the bottom-of-page
   real estate clean. The FAB fades in the moment a visitor adds an item
   (renderBadge flips .empty off), and out again if they clear the cart. */
.ctc-cart-fab.empty{
  opacity:0;transform:translateY(8px) scale(.9);pointer-events:none;
}
.ctc-cart-fab.bump{animation:ctc-cart-bump .35s ease}
@keyframes ctc-cart-bump{
  0%,100%{transform:scale(1)}
  40%{transform:scale(1.15)}
}

.ctc-cart-overlay{
  position:fixed;inset:0;background:rgba(26,46,28,.55);z-index:9998;
  opacity:0;pointer-events:none;transition:opacity .2s ease;
}
.ctc-cart-drawer{
  position:fixed;top:0;right:0;bottom:0;width:min(440px, 100vw);
  z-index:9999;background:#fbf7ef;
  display:flex;flex-direction:column;
  font-family:'DM Sans',-apple-system,system-ui,sans-serif;color:#1a1a1a;
  transform:translateX(100%);transition:transform .25s ease;
  box-shadow:-8px 0 32px rgba(0,0,0,.22);
}
.ctc-cart-open .ctc-cart-overlay{opacity:1;pointer-events:auto}
.ctc-cart-open .ctc-cart-drawer{transform:translateX(0)}

.ctc-cart-head{
  background:#2D4A32;color:#fff;padding:18px 22px;
  display:flex;align-items:center;gap:12px;flex-shrink:0;
}
.ctc-cart-head h3{font-family:'Bebas Neue','DM Sans',sans-serif;font-size:1.35rem;
  letter-spacing:.04em;text-transform:uppercase;margin:0;flex:1;font-weight:700}
.ctc-cart-close{
  background:transparent;border:none;color:rgba(255,255,255,.7);cursor:pointer;
  font-size:1.8rem;line-height:1;padding:0 4px;font-family:inherit;
}
.ctc-cart-close:hover{color:#C9A96E}

.ctc-cart-items{flex:1;overflow-y:auto;padding:14px 18px;background:#fbf7ef}
.ctc-cart-empty{
  text-align:center;color:#5a5a5a;font-size:.9rem;padding:40px 20px;line-height:1.6;
}
.ctc-cart-empty strong{display:block;color:#2D4A32;font-family:'Bebas Neue',sans-serif;
  font-size:1.2rem;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase}
.ctc-cart-empty-suggest{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}
.ctc-cart-empty-suggest a{
  background:#2D4A32;color:#C9A96E;text-decoration:none;font-weight:800;
  padding:8px 14px;border-radius:4px;font-size:.74rem;letter-spacing:.08em;
  text-transform:uppercase;transition:background .15s ease;font-family:inherit;
}
.ctc-cart-empty-suggest a:hover{background:#1a2e1c}

.ctc-cart-item{
  background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:8px;
  padding:12px 14px;margin-bottom:10px;
  display:flex;align-items:flex-start;gap:10px;
  box-shadow:0 2px 6px rgba(0,0,0,.03);
}
.ctc-cart-item-info{flex:1;min-width:0}
.ctc-cart-item-name{font-weight:700;color:#2D4A32;font-size:.94rem;line-height:1.2;margin-bottom:3px}
.ctc-cart-item-config{font-size:.74rem;color:#5a5a5a;line-height:1.3;margin-bottom:6px}
.ctc-cart-item-config .used-tag{
  display:inline-block;background:#a98843;color:#fff;font-weight:700;
  font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;
  padding:1px 6px;border-radius:3px;margin-left:4px;vertical-align:1px;
}
.ctc-cart-item-price{font-family:'Bebas Neue',sans-serif;font-size:1.2rem;
  color:#a98843;letter-spacing:.02em;line-height:1}
.ctc-cart-item-controls{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.ctc-cart-qty-grp{display:flex;align-items:center;border:1px solid rgba(0,0,0,.12);border-radius:5px;overflow:hidden}
.ctc-cart-qty-btn{
  background:transparent;border:none;cursor:pointer;width:26px;height:26px;
  font-size:1rem;color:#2D4A32;font-family:inherit;font-weight:700;
}
.ctc-cart-qty-btn:hover{background:#f5f0e8}
.ctc-cart-qty-btn:disabled{color:rgba(0,0,0,.2);cursor:not-allowed}
.ctc-cart-qty{min-width:24px;text-align:center;font-size:.86rem;font-weight:700;color:#1a1a1a}
.ctc-cart-remove{
  background:transparent;border:none;color:#7a7a7a;cursor:pointer;
  font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;
  padding:2px 4px;font-family:inherit;font-weight:600;
}
.ctc-cart-remove:hover{color:#c44a3a}

.ctc-cart-suggest{
  padding:12px 22px 4px;background:#fbf7ef;border-top:1px solid rgba(0,0,0,.06);
  display:flex;flex-direction:column;gap:8px;flex-shrink:0;
}
.ctc-cart-suggest[hidden]{display:none}
.ctc-cart-suggest-eyebrow{font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;
  font-weight:800;color:#a98843}
.ctc-cart-suggest-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ctc-cart-suggest-card{
  background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:6px;
  padding:9px 12px;text-decoration:none;color:#2D4A32;
  display:flex;flex-direction:column;gap:1px;
  transition:border-color .15s ease, transform .1s ease;
}
.ctc-cart-suggest-card:hover{border-color:#C9A96E;transform:translateY(-1px)}
.ctc-cart-suggest-card strong{font-size:.82rem;letter-spacing:.02em;font-weight:800;
  font-family:'Bebas Neue','DM Sans',sans-serif;text-transform:uppercase;line-height:1.1}
.ctc-cart-suggest-card span{font-size:.66rem;color:#5a5a5a;line-height:1.3}

/* Sticky footer wraps the subtotal row + the checkout form. The drop
   shadow above lifts it off the scrolling items, so it always reads as
   the anchored action area — same pattern as Shopify's drawer cart. */
.ctc-cart-footer{
  background:#fff;flex-shrink:0;
  box-shadow:0 -6px 18px rgba(0,0,0,.06);
}
.ctc-cart-totals{
  padding:14px 22px 6px;background:#fff;
  display:flex;align-items:baseline;justify-content:space-between;
}
.ctc-cart-totals span{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;
  color:#5a5a5a;font-weight:700}
.ctc-cart-totals strong{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;
  color:#2D4A32;letter-spacing:.02em}

.ctc-cart-checkout{
  padding:10px 22px 22px;background:#fff;
  display:flex;flex-direction:column;gap:8px;
}
.ctc-cart-checkout-toggle{
  /* Primary CTA — filled green "Checkout — $X" button that also opens
     the contact form below. Full-width so it works one-thumb on mobile;
     the embedded price keeps the customer anchored to total spend even
     while filling in details. */
  display:flex;align-items:center;justify-content:center;gap:12px;
  background:#2D4A32;color:#C9A96E;border:none;cursor:pointer;
  padding:14px 18px;border-radius:6px;margin:0;width:100%;
  font-family:'Bebas Neue','DM Sans',sans-serif;font-size:1.05rem;
  letter-spacing:.08em;text-transform:uppercase;font-weight:800;
  transition:background .15s ease,transform .1s ease;
}
.ctc-cart-checkout-toggle:hover{background:#1a2e1c}
.ctc-cart-checkout-toggle:active{transform:scale(.99)}
.ctc-cart-checkout-toggle:focus-visible{outline:2px solid #C9A96E;outline-offset:3px}
.ctc-cart-checkout-toggle .ctc-cart-toggle-price{
  font-family:'Bebas Neue',sans-serif;color:#fff;
  border-left:1px solid rgba(255,255,255,.28);padding-left:12px;
  letter-spacing:.02em;
}
.ctc-cart-checkout-toggle .chev{
  width:16px;height:16px;flex-shrink:0;transition:transform .25s ease;
  color:rgba(201,169,110,.75);
}
.ctc-cart-checkout.is-open .ctc-cart-checkout-toggle .chev{transform:rotate(180deg)}
.ctc-cart-checkout-body{
  /* Collapsed by default. max-height collapse plus opacity fade gives a
     calm, in-place reveal without layout jank. The big max-height upper
     bound is fine — actual height is governed by content, the cap just
     needs to exceed any plausible form length. */
  display:flex;flex-direction:column;gap:8px;
  max-height:0;overflow:hidden;opacity:0;
  transition:max-height .28s ease,opacity .2s ease,margin-top .25s ease;
  margin-top:0;
}
.ctc-cart-checkout.is-open .ctc-cart-checkout-body{
  max-height:760px;opacity:1;margin-top:10px;
}
.ctc-cart-checkout h4{
  font-family:'Bebas Neue','DM Sans',sans-serif;font-size:1rem;
  letter-spacing:.06em;text-transform:uppercase;color:#2D4A32;margin:0 0 2px;font-weight:700;
}
.ctc-cart-note{font-size:.72rem;color:#5a5a5a;line-height:1.4;margin:0 0 4px}
.ctc-cart-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ctc-cart-checkout input,
.ctc-cart-checkout textarea{
  width:100%;border:1px solid rgba(45,74,50,.18);border-radius:6px;
  padding:8px 10px;font-family:inherit;font-size:.88rem;color:#1a1a1a;
  background:#fbf7ef;transition:border-color .15s ease;resize:none;
}
.ctc-cart-checkout input:focus,
.ctc-cart-checkout textarea:focus{outline:none;border-color:#6B8F71}
.ctc-cart-checkout textarea{min-height:62px;line-height:1.4}
.ctc-cart-contact-hint{font-size:.68rem;color:#7a7a7a;margin:-2px 0 2px;line-height:1.3}
.ctc-cart-error{font-size:.78rem;color:#c44a3a;line-height:1.4;margin:2px 0}
.ctc-cart-submit{
  background:#2D4A32;color:#C9A96E;border:none;cursor:pointer;
  padding:12px 16px;border-radius:6px;font-family:inherit;font-weight:800;
  font-size:.86rem;letter-spacing:.08em;text-transform:uppercase;margin-top:4px;
  transition:background .15s ease,transform .1s ease;
}
.ctc-cart-submit:hover{background:#1a2e1c}
.ctc-cart-submit:active{transform:scale(.98)}
.ctc-cart-submit:disabled{opacity:.5;cursor:not-allowed}

.ctc-cart-success{
  padding:30px 22px;background:#fff;border-top:1px solid rgba(0,0,0,.08);
  text-align:center;flex-shrink:0;
}
.ctc-cart-success strong{
  display:block;font-family:'Bebas Neue',sans-serif;font-size:1.5rem;
  color:#2D4A32;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;
}
.ctc-cart-success p{font-size:.88rem;color:#5a5a5a;line-height:1.55;margin:0 0 16px}
.ctc-cart-success-id{font-size:.7rem;color:#a98843;letter-spacing:.12em;
  text-transform:uppercase;font-weight:700;margin-bottom:14px}
.ctc-cart-success button{
  background:transparent;border:1px solid #2D4A32;color:#2D4A32;cursor:pointer;
  padding:9px 18px;border-radius:4px;font-family:inherit;font-weight:700;
  font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;
}
.ctc-cart-success button:hover{background:#2D4A32;color:#fff}

@media(max-width:560px){
  .ctc-cart-drawer{width:100vw}
  .ctc-cart-fab{left:14px;bottom:calc(14px + env(safe-area-inset-bottom, 0px));width:50px;height:50px}
  .ctc-cart-fab svg{width:22px;height:22px}
}
  `;

  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);

  // ── State ─────────────────────────────────────────────────────
  function readCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch (e) {}
    return { items: [] };
  }
  function writeCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
    renderBadge();
    renderItems();
  }
  let cart = readCart();

  // ── DOM ───────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.className = 'ctc-cart-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'View cart');
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3h2l2.4 12.5a2 2 0 0 0 2 1.5H17a2 2 0 0 0 2-1.6L20.5 8H6"/>
      <circle cx="10" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/>
    </svg>
    <span class="ctc-cart-badge">0</span>
  `;
  fab.addEventListener('click', openDrawer);

  const wrap = document.createElement('div');
  wrap.className = 'ctc-cart-wrap';
  wrap.innerHTML = `
    <div class="ctc-cart-overlay" data-act="close"></div>
    <aside class="ctc-cart-drawer" role="dialog" aria-label="Cart">
      <header class="ctc-cart-head">
        <h3>Your Cart</h3>
        <button class="ctc-cart-close" type="button" data-act="close" aria-label="Close">×</button>
      </header>
      <div class="ctc-cart-items"></div>
      <div class="ctc-cart-suggest" hidden>
        <span class="ctc-cart-suggest-eyebrow">While you're here</span>
        <div class="ctc-cart-suggest-grid">
          <a class="ctc-cart-suggest-card" href="accessories.html">
            <strong>Accessories</strong>
            <span>Locks, lights, helmets, gear</span>
          </a>
          <a class="ctc-cart-suggest-card" href="apparel.html">
            <strong>Apparel</strong>
            <span>Cruise the Creek merch</span>
          </a>
        </div>
      </div>
      <div class="ctc-cart-footer">
        <div class="ctc-cart-totals">
          <span>Subtotal</span>
          <strong class="ctc-cart-subtotal">$0</strong>
        </div>
        <form class="ctc-cart-checkout" novalidate>
          <button type="button" class="ctc-cart-checkout-toggle" data-act="toggle-checkout"
                  aria-expanded="false" aria-controls="ctc-cart-checkout-body">
            <span>Checkout</span>
            <span class="ctc-cart-toggle-price">$0</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        <div class="ctc-cart-checkout-body" id="ctc-cart-checkout-body">
          <p class="ctc-cart-note">We'll follow up to confirm details and send a payment link. Email or phone — one is enough.</p>
          <div class="ctc-cart-row">
            <input name="firstName" placeholder="First name" autocomplete="given-name" required>
            <input name="lastName"  placeholder="Last name"  autocomplete="family-name" required>
          </div>
          <input name="email" type="email" placeholder="you@example.com" autocomplete="email">
          <input name="phone" type="tel"   placeholder="330-555-1234"     autocomplete="tel">
          <textarea name="notes" placeholder="Anything else we should know — pickup preference, customization, questions, etc."></textarea>
          <div class="ctc-cart-error" hidden></div>
          <button type="submit" class="ctc-cart-submit">Send Order</button>
        </div>
      </form>
      </div>
      <div class="ctc-cart-success" hidden>
        <strong>Order sent.</strong>
        <p>Pat or the team will text or email shortly to confirm details and send a payment link.</p>
        <div class="ctc-cart-success-id"></div>
        <div class="ctc-cart-empty-suggest"></div>
        <button type="button" data-act="close">Keep browsing</button>
      </div>
    </aside>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(wrap);

  // ── Render ────────────────────────────────────────────────────
  function renderBadge() {
    const n = cart.items.reduce((s, i) => s + (parseInt(i.qty, 10) || 1), 0);
    const badge = fab.querySelector('.ctc-cart-badge');
    badge.textContent = n;
    fab.classList.toggle('empty', n === 0);
  }

  function renderItems() {
    const itemsEl = wrap.querySelector('.ctc-cart-items');
    if (cart.items.length === 0) {
      itemsEl.innerHTML = `
        <div class="ctc-cart-empty">
          <strong>Cart's empty</strong>
          Add a bike or accessory and it'll show up here.
          <div class="ctc-cart-empty-suggest">
            ${suggestLinks().map(l => `<a href="${l.href}">${l.label}</a>`).join('')}
          </div>
        </div>`;
    } else {
      itemsEl.innerHTML = cart.items.map((it, idx) => `
        <div class="ctc-cart-item">
          <div class="ctc-cart-item-info">
            <div class="ctc-cart-item-name">${esc(it.brand || '')}${it.brand ? ' ' : ''}${esc(it.name || '')}</div>
            <div class="ctc-cart-item-config">${configLine(it)}</div>
            <div class="ctc-cart-item-price">$${formatPrice(it.price)}</div>
          </div>
          <div class="ctc-cart-item-controls">
            <div class="ctc-cart-qty-grp">
              <button class="ctc-cart-qty-btn" type="button" data-act="dec" data-i="${idx}" ${(it.qty || 1) <= 1 ? 'disabled' : ''}>−</button>
              <span class="ctc-cart-qty">${it.qty || 1}</span>
              <button class="ctc-cart-qty-btn" type="button" data-act="inc" data-i="${idx}">+</button>
            </div>
            <button class="ctc-cart-remove" type="button" data-act="rm" data-i="${idx}">Remove</button>
          </div>
        </div>
      `).join('');
    }
    const subtotal = cart.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty, 10) || 1), 0);
    const subtotalText = '$' + formatPrice(subtotal);
    wrap.querySelector('.ctc-cart-subtotal').textContent = subtotalText;
    const priceEl = wrap.querySelector('.ctc-cart-toggle-price');
    if (priceEl) priceEl.textContent = subtotalText;
    // Hide the entire sticky footer (subtotal + Checkout CTA) when the
    // cart is empty — a $0 Checkout button would be a dead-end action.
    const footer = wrap.querySelector('.ctc-cart-footer');
    if (footer) footer.hidden = cart.items.length === 0;
    renderSuggest();
  }

  // Cross-sell rail. Sits between items and totals, only shows when
  // the cart has items so the suggestion lands after the customer has
  // committed to something — not as cold "browse this" noise.
  function renderSuggest() {
    const suggestEl = wrap.querySelector('.ctc-cart-suggest');
    const hasItems = cart.items.length > 0;
    suggestEl.hidden = !hasItems;
    if (!hasItems) return;
    // Hide whichever suggestion points at the page we're already on.
    const here = (typeof location !== 'undefined' && location.pathname || '').toLowerCase();
    suggestEl.querySelectorAll('.ctc-cart-suggest-card').forEach(card => {
      const href = (card.getAttribute('href') || '').toLowerCase();
      card.style.display = (href && here.endsWith('/' + href)) ? 'none' : '';
    });
  }

  // Suggested next-stops for the empty-state and the post-checkout
  // success screen. Suppresses the page we're already on so the
  // suggestion always points somewhere new.
  function suggestLinks() {
    const here = (typeof location !== 'undefined' && location.pathname || '').toLowerCase();
    const all = [
      { href: 'shop.html',        label: 'Shop' },
      { href: 'accessories.html', label: 'Accessories' },
      { href: 'apparel.html',     label: 'Apparel' },
    ];
    return all.filter(l => !here.endsWith('/' + l.href));
  }

  renderBadge();
  renderItems();

  // ── Drawer open/close ────────────────────────────────────────
  function openDrawer() {
    wrap.classList.add('ctc-cart-open');
    document.body.style.overflow = 'hidden';
    resetCheckoutSurface();
  }
  function closeDrawer() {
    wrap.classList.remove('ctc-cart-open');
    document.body.style.overflow = '';
  }
  function resetCheckoutSurface() {
    const form = wrap.querySelector('.ctc-cart-checkout');
    form.hidden = false;
    form.classList.remove('is-open');
    const toggle = wrap.querySelector('.ctc-cart-checkout-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    wrap.querySelector('.ctc-cart-success').hidden = true;
    wrap.querySelector('.ctc-cart-error').hidden = true;
    // renderItems already drives footer visibility from cart state, but
    // we also need to flip it on after a previous success (when this
    // function runs from openDrawer with a fresh cart load).
    const footer = wrap.querySelector('.ctc-cart-footer');
    if (footer) footer.hidden = cart.items.length === 0;
  }

  wrap.addEventListener('click', (e) => {
    // closest() rather than e.target.dataset so clicks on inner elements
    // (the chevron SVG inside the toggle, or any inline span) still
    // resolve to the action on the surrounding button.
    const actEl = e.target.closest('[data-act]');
    const act = actEl && actEl.dataset.act;
    if (!act) return;
    if (act === 'close') return closeDrawer();
    if (act === 'toggle-checkout') return toggleCheckout();
    const i = parseInt(actEl.dataset.i, 10);
    if (!isFinite(i) || i < 0 || i >= cart.items.length) return;
    if (act === 'inc') cart.items[i].qty = (cart.items[i].qty || 1) + 1;
    else if (act === 'dec') cart.items[i].qty = Math.max(1, (cart.items[i].qty || 1) - 1);
    else if (act === 'rm')  cart.items.splice(i, 1);
    writeCart();
  });

  function toggleCheckout(force) {
    const form  = wrap.querySelector('.ctc-cart-checkout');
    const btn   = wrap.querySelector('.ctc-cart-checkout-toggle');
    const open  = typeof force === 'boolean' ? force : !form.classList.contains('is-open');
    form.classList.toggle('is-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    // When expanding on mobile, scroll the form into view so the inputs
    // aren't hidden under the keyboard or below the fold.
    if (open) {
      requestAnimationFrame(() => {
        form.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrap.classList.contains('ctc-cart-open')) closeDrawer();
  });

  // ── Checkout submit ──────────────────────────────────────────
  const checkoutForm = wrap.querySelector('.ctc-cart-checkout');
  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = wrap.querySelector('.ctc-cart-error');
    errEl.hidden = true;

    if (cart.items.length === 0) {
      return showError('Add at least one item before sending an order.');
    }
    const data = Object.fromEntries(new FormData(checkoutForm));
    if (!data.firstName || !data.lastName) {
      return showError('Add your first and last name.');
    }
    if (!data.email && !data.phone) {
      return showError('Add an email or phone so we can reach you to confirm.');
    }

    const btn = checkoutForm.querySelector('.ctc-cart-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const params = new URLSearchParams({
        action:    'cartOrder',
        firstName: String(data.firstName || ''),
        lastName:  String(data.lastName  || ''),
        email:     String(data.email     || ''),
        phone:     String(data.phone     || ''),
        notes:     String(data.notes     || ''),
        cart:      JSON.stringify(cart.items),
        page:      (typeof location !== 'undefined' && location.href) ? location.href : '',
      });
      let orderId = '';
      try {
        const r = await fetch(AS_URL + '?' + params.toString(), { redirect: 'follow' });
        const text = await r.text();
        try {
          const j = JSON.parse(text);
          if (j && j.id) orderId = j.id;
        } catch (e) {}
      } catch (netErr) {
        // Apps Script often redirects in ways that throw a CORS-style error
        // mid-request even when the server-side write succeeded. Treat as
        // success — the customer's much better off with a "we got it" than
        // a scary error on a likely-good submit.
      }
      cart = { items: [] };
      writeCart();
      checkoutForm.reset();
      // Hide the entire sticky footer post-submit so the success card
      // sits cleanly at the bottom — leaving an empty $0 subtotal +
      // Checkout CTA visible alongside "Order sent" reads confused.
      const footerEl = wrap.querySelector('.ctc-cart-footer');
      if (footerEl) footerEl.hidden = true;
      const successEl = wrap.querySelector('.ctc-cart-success');
      successEl.hidden = false;
      const idEl = successEl.querySelector('.ctc-cart-success-id');
      idEl.textContent = orderId ? 'Order #' + orderId : '';
      // Inject the cross-sell links into the success screen too — keeps
      // the visitor on-site after a conversion instead of bouncing.
      const suggestEl = successEl.querySelector('.ctc-cart-empty-suggest');
      suggestEl.innerHTML = suggestLinks().map(l => `<a href="${l.href}">${l.label}</a>`).join('');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Order';
    }
  });

  function showError(msg) {
    const el = wrap.querySelector('.ctc-cart-error');
    el.textContent = msg;
    el.hidden = false;
  }

  // ── Helpers ──────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
    ));
  }
  function formatPrice(n) {
    const v = parseFloat(n);
    if (!isFinite(v)) return '0';
    return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function configLine(it) {
    const parts = [];
    if (it.category) parts.push(it.category);
    const c = it.configuration || {};
    if (c.style) parts.push(c.style);
    if (c.size)  parts.push(c.size);
    if (c.color) parts.push(c.color);
    // Apparel-specific: print placement (chest, back, sleeve, etc.).
    // Bikes don't pass this, so the slot stays empty there.
    if (c.placement) parts.push(c.placement);
    let html = parts.map(esc).join(' · ');
    if (it.condition === 'used') html += ' <span class="used-tag">Used</span>';
    return html || '<span style="color:#aaa">—</span>';
  }
  function configSignature(it) {
    const c = it.configuration || {};
    return [it.kind || '', it.brand || '', it.name || '', c.style || '', c.size || '', c.color || '', c.placement || '', it.condition || ''].join('|');
  }

  // ── Public API ───────────────────────────────────────────────
  window.ctcCart = {
    add(item) {
      if (!item || !item.name) return;
      const incoming = {
        kind:          String(item.kind || 'item'),
        brand:         String(item.brand || ''),
        name:          String(item.name),
        category:      String(item.category || ''),
        price:         parseFloat(item.price) || 0,
        configuration: item.configuration || {},
        condition:     item.condition === 'used' ? 'used' : 'new',
        qty:           parseInt(item.qty, 10) || 1,
      };
      const sig = configSignature(incoming);
      const match = cart.items.find(i => configSignature(i) === sig);
      if (match) match.qty = (match.qty || 1) + incoming.qty;
      else cart.items.push(incoming);
      writeCart();
      fab.classList.remove('bump');
      void fab.offsetWidth; // restart anim
      fab.classList.add('bump');
      openDrawer();
    },
    count() {
      return cart.items.reduce((s, i) => s + (parseInt(i.qty, 10) || 1), 0);
    },
    open: openDrawer,
  };
})();
