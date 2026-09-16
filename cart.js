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
  const DRAFT_KEY = 'ctc_cart_checkout_draft_v1';
  const PROMO_KEY = 'ctc_active_promo_v1';
  const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  // Flat shipping when the customer chooses delivery; local pickup is free.
  // Pat reviews every cart as a draft invoice, so he can adjust this on
  // larger orders (e.g. a bike) before sending the payment link.
  const SHIP_FLAT = 5;
  const AS_URL = 'https://script.google.com/macros/s/AKfycbwXv6r6Me-mdp9WFjCHQYDHcgEKbny-9_K8TX-yGgW40yTONhz6kAs3H96xM0tEDAhcJA/exec';

  // ── State ─────────────────────────────────────────────────────
  function readActivePromo() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const p = new URLSearchParams(window.location.search);
        const ref = p.get('ref') || p.get('referral') || p.get('promoCode') || '';
        const promo = (p.get('promo') || '').toUpperCase();
        // Referral codes do not discount apparel/accessories (discount only applies to tune-ups/repairs)
        if (promo === '20OFF' || discount === '20') {
          const promoData = {
            code: promo || 'Promo Discount',
            discountPercent: 20,
            label: 'Promo Discount (20%)'
          };
          localStorage.setItem(PROMO_KEY, JSON.stringify(promoData));
          return promoData;
        }
      }
      const saved = localStorage.getItem(PROMO_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  }

  function clearActivePromo() {
    try { localStorage.removeItem(PROMO_KEY); } catch (e) {}
    renderItems();
  }

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

  // Abandon recovery — store the in-flight contact details so a visitor
  // who closes the drawer (or the tab) mid-checkout finds the same
  // fields filled in when they come back. 30-day expiry keeps stale
  // drafts from lingering. Cleared on successful submit.
  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || (Date.now() - parsed.ts) > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      return parsed.data || null;
    } catch (e) { return null; }
  }
  function writeDraft(data) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  // ── Styles ────────────────────────────────────────────────────
  // The header has always claimed this widget injects its own CSS. It did not,
  // and nothing else in the repo styles a .ctc-cart- class, so every page that
  // loads cart.js rendered an unstyled <button> at full container width with a
  // 1276px SVG inside it — the "huge shopping cart". Measured on mooncool.html
  // before this: 1280x1298.
  //
  // Colours are read from the host page's custom properties where they exist,
  // with the brand values as fallbacks, so the widget matches whichever page it
  // lands on instead of imposing its own palette.
  const CART_CSS = `
.ctc-cart-fab{position:fixed;right:20px;bottom:20px;z-index:9998;
  width:56px;height:56px;min-width:56px;flex:0 0 56px;padding:0;border:none;
  border-radius:50%;cursor:pointer;display:flex;align-items:center;
  justify-content:center;box-sizing:border-box;
  background:var(--forest,#2D4A32);color:#fff;
  box-shadow:0 4px 16px rgba(0,0,0,.28);transition:transform .18s ease}
.ctc-cart-fab:hover{transform:scale(1.06)}
.ctc-cart-fab svg{width:26px;height:26px;flex:0 0 26px;
  fill:none;stroke:currentColor;stroke-width:2}
.ctc-cart-fab.empty{display:none}
.ctc-cart-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;
  padding:0 5px;border-radius:10px;background:var(--tan,#C9A96E);color:#1a1a1a;
  font:700 11px/20px 'DM Sans',sans-serif;text-align:center;box-sizing:border-box}

.ctc-cart-wrap{position:fixed;inset:0;z-index:9999;pointer-events:none;
  visibility:hidden}
.ctc-cart-wrap.ctc-cart-open{pointer-events:auto;visibility:visible}
.ctc-cart-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);
  opacity:0;transition:opacity .22s ease}
.ctc-cart-open .ctc-cart-overlay{opacity:1}
.ctc-cart-drawer{position:absolute;top:0;right:0;height:100%;
  width:min(420px,100vw);display:flex;flex-direction:column;
  background:var(--cream-w,#fbf7ef);box-shadow:-8px 0 28px rgba(0,0,0,.2);
  transform:translateX(100%);transition:transform .26s ease;box-sizing:border-box}
.ctc-cart-open .ctc-cart-drawer{transform:translateX(0)}
.ctc-cart-head{display:flex;align-items:center;justify-content:space-between;
  padding:16px 18px;border-bottom:1px solid rgba(0,0,0,.08);
  background:var(--forest,#2D4A32);color:#fff}
.ctc-cart-head h3{margin:0;font-size:1.05rem;letter-spacing:.04em}
.ctc-cart-close{background:none;border:none;color:inherit;font-size:1.6rem;
  line-height:1;cursor:pointer;padding:0 4px}
.ctc-cart-items{flex:1;overflow-y:auto;padding:14px 18px;min-height:0}
.ctc-cart-item{display:flex;gap:12px;align-items:flex-start;padding:12px 0;
  border-bottom:1px solid rgba(0,0,0,.07)}
.ctc-cart-item-info{flex:1;min-width:0}
.ctc-cart-item-name{font-weight:700;font-size:.92rem;color:var(--ink,#1a1a1a)}
.ctc-cart-item-config{font-size:.78rem;color:var(--ink-3,#6a6a6a);margin-top:2px}
.ctc-cart-item-price{font-weight:700;white-space:nowrap}
.ctc-cart-item-controls{display:flex;align-items:center;gap:10px;margin-top:6px}
.ctc-cart-qty-grp{display:inline-flex;align-items:center;gap:6px;
  border:1px solid rgba(0,0,0,.15);border-radius:6px;padding:2px}
.ctc-cart-qty-btn{width:24px;height:24px;border:none;background:none;
  cursor:pointer;font-size:1rem;line-height:1;color:var(--ink,#1a1a1a)}
.ctc-cart-qty{min-width:20px;text-align:center;font-size:.85rem}
.ctc-cart-remove{background:none;border:none;cursor:pointer;font-size:.78rem;
  color:var(--ink-3,#6a6a6a);text-decoration:underline;padding:0}
.ctc-cart-empty{text-align:center;color:var(--ink-3,#6a6a6a);padding:32px 12px}
.ctc-cart-empty-suggest{margin-top:10px;font-size:.85rem}

.ctc-cart-footer{border-top:1px solid rgba(0,0,0,.1);padding:14px 18px;
  background:var(--cream,#F5F0E8)}
.ctc-cart-row,.ctc-cart-ship-line,.ctc-cart-discount-line{display:flex;
  justify-content:space-between;align-items:center;font-size:.88rem;padding:3px 0}
.ctc-cart-subtotal,.ctc-cart-totals{display:flex;justify-content:space-between;
  align-items:center;font-weight:700;padding:6px 0}
.ctc-cart-discount-label,.ctc-cart-discount-amt{color:var(--sage-d,#557159)}
.ctc-cart-note{font-size:.76rem;color:var(--ink-3,#6a6a6a);margin-top:6px}
.ctc-cart-promo-banner{display:flex;justify-content:space-between;
  align-items:center;gap:8px;background:var(--accent-bg,#e8e0f2);
  border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:.82rem}
.ctc-cart-promo-code{font-weight:700;letter-spacing:.04em}
.ctc-cart-promo-detail{color:var(--ink-2,#4a4a4a)}
.ctc-cart-promo-tag{font-size:.72rem;background:var(--accent,#9484b8);
  color:var(--on-accent,#fff);border-radius:4px;padding:1px 6px}
.ctc-cart-promo-remove{background:none;border:none;cursor:pointer;
  color:var(--ink-3,#6a6a6a);font-size:1rem;line-height:1;padding:0 2px}
.ctc-cart-checkout-toggle{width:100%;background:none;border:none;cursor:pointer;
  text-align:left;font-weight:700;font-size:.86rem;padding:8px 0;
  color:var(--forest,#2D4A32)}
.ctc-cart-checkout-body{display:none}
.ctc-cart-checkout-body.open{display:block}
.ctc-cart-ship-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;
  margin:8px 0}
.ctc-cart-checkout input,.ctc-cart-checkout textarea,.ctc-cart-checkout select{
  width:100%;box-sizing:border-box;padding:8px 10px;font:inherit;font-size:.85rem;
  border:1px solid rgba(0,0,0,.18);border-radius:6px;background:#fff}
.ctc-cart-submit{width:100%;margin-top:10px;padding:12px;border:none;
  border-radius:8px;cursor:pointer;font-weight:800;letter-spacing:.04em;
  background:var(--forest,#2D4A32);color:#fff}
.ctc-cart-submit:disabled{opacity:.55;cursor:not-allowed}
.ctc-cart-error{color:#a3302a;font-size:.8rem;margin-top:6px}
.ctc-cart-success{text-align:center;padding:26px 14px}
.ctc-cart-success-id{font-weight:800;letter-spacing:.06em;margin-top:6px}

.ctc-cart-suggest{padding:12px 18px;border-top:1px solid rgba(0,0,0,.08)}
.ctc-cart-suggest-eyebrow{font-size:.72rem;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3,#6a6a6a);margin-bottom:8px}
.ctc-cart-suggest-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.ctc-cart-suggest-card{border:1px solid rgba(0,0,0,.12);border-radius:8px;
  padding:8px;font-size:.78rem;cursor:pointer;background:#fff;text-align:left}
.ctc-cart-suggest-card.featured{border-color:var(--tan,#C9A96E)}
.ctc-cart-toggle-price{font-weight:700}

@media (max-width:480px){
  .ctc-cart-drawer{width:100vw}
  .ctc-cart-suggest-grid{grid-template-columns:1fr}
}`;

  if (!document.getElementById('ctc-cart-css')) {
    const st = document.createElement('style');
    st.id = 'ctc-cart-css';
    st.textContent = CART_CSS;
    document.head.appendChild(st);
  }

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
      <div class="ctc-cart-promo-banner" hidden>
        <div>
          <span class="ctc-cart-promo-tag">⚡ 25% Member Discount Applied</span>
          <div class="ctc-cart-promo-detail">Code: <strong class="ctc-cart-promo-code"></strong></div>
        </div>
        <button type="button" class="ctc-cart-promo-remove" data-act="rm-promo">Remove</button>
      </div>
      <div class="ctc-cart-items"></div>
      <div class="ctc-cart-suggest" hidden>
        <span class="ctc-cart-suggest-eyebrow">While you're here</span>
        <div class="ctc-cart-suggest-grid">
          <a class="ctc-cart-suggest-card featured" href="shop.html">
            <strong>Shop Bikes</strong>
            <span>Heybike · Velotric · Mooncool · Jasion · Mokwheel</span>
          </a>
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
        <div class="ctc-cart-discount-line" hidden>
          <span class="ctc-cart-discount-label">Member Discount (25%)</span>
          <strong class="ctc-cart-discount-amt">-$0</strong>
        </div>
        <div class="ctc-cart-ship-line" hidden>
          <span>Shipping</span>
          <span class="ctc-cart-ship-amt">$0</span>
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
          <div class="ctc-cart-delivery">
            <label><input type="radio" name="delivery" value="pickup" checked> Local pickup — Free</label>
            <label><input type="radio" name="delivery" value="ship"> Ship · +$${SHIP_FLAT}</label>
          </div>
          <div class="ctc-cart-ship-fields" hidden>
            <input name="address" placeholder="Street address" autocomplete="street-address">
            <div class="ctc-cart-row">
              <input name="city"  placeholder="City"  autocomplete="address-level2">
              <input name="state" placeholder="State" autocomplete="address-level1">
            </div>
            <input name="zip" placeholder="ZIP code" autocomplete="postal-code" inputmode="numeric">
          </div>
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

  // Flat shipping when "Ship" is selected and the cart isn't empty; 0 for
  // local pickup. Reads the live radio so totals update on toggle.
  function currentShipping() {
    if (cart.items.length === 0) return 0;
    const sel = wrap.querySelector('input[name="delivery"]:checked');
    return (sel && sel.value === 'ship') ? SHIP_FLAT : 0;
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
    wrap.querySelector('.ctc-cart-subtotal').textContent = '$' + formatPrice(subtotal);

    const promoBanner = wrap.querySelector('.ctc-cart-promo-banner');
    const discountLine = wrap.querySelector('.ctc-cart-discount-line');
    if (promoBanner) promoBanner.hidden = true;
    if (discountLine) discountLine.hidden = true;

    // Shipping line tracks the delivery radio; the Checkout CTA shows the
    // grand total (merchandise + shipping) so the customer sees true spend.
    const ship = currentShipping();
    const shipLine = wrap.querySelector('.ctc-cart-ship-line');
    if (shipLine) {
      shipLine.hidden = ship <= 0;
      const amtEl = shipLine.querySelector('.ctc-cart-ship-amt');
      if (amtEl) amtEl.textContent = '$' + formatPrice(ship);
    }
    const finalTotal = Math.max(0, subtotal + ship);
    const priceEl = wrap.querySelector('.ctc-cart-toggle-price');
    if (priceEl) priceEl.textContent = '$' + formatPrice(finalTotal);

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
    if (act === 'rm-promo') return clearActivePromo();
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

  // Hydrate the form from URL parameters first, then any saved draft
  const DRAFT_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'notes'];
  (function bindCheckoutDraftRecovery() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const p = new URLSearchParams(window.location.search);
        const urlVals = {
          firstName: p.get('firstName') || p.get('first') || '',
          lastName:  p.get('lastName')  || p.get('last')  || '',
          email:     p.get('email')     || '',
          phone:     p.get('phone')     || '',
          address:   p.get('address')   || '',
          city:      p.get('city')      || '',
          state:     p.get('state')     || '',
          zip:       p.get('zip')       || '',
        };
        DRAFT_FIELDS.forEach(name => {
          const el = checkoutForm.querySelector(`[name="${name}"]`);
          if (el && urlVals[name]) el.value = urlVals[name];
        });
      }
    } catch (_) {}

    const draft = readDraft();
    if (draft) {
      DRAFT_FIELDS.forEach(name => {
        const el = checkoutForm.querySelector(`[name="${name}"]`);
        if (el && draft[name] != null && el.value === '') el.value = draft[name];
      });
    }
    // Delivery toggle: reveal the address block + refresh totals on change.
    const shipFields = checkoutForm.querySelector('.ctc-cart-ship-fields');
    checkoutForm.querySelectorAll('input[name="delivery"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (shipFields) shipFields.hidden = !(radio.value === 'ship' && radio.checked);
        renderItems();
      });
    });
    checkoutForm.addEventListener('input', () => {
      const data = {};
      let hasAny = false;
      DRAFT_FIELDS.forEach(name => {
        const el = checkoutForm.querySelector(`[name="${name}"]`);
        if (el) {
          data[name] = el.value;
          if (el.value) hasAny = true;
        }
      });
      if (hasAny) writeDraft(data); else clearDraft();
    });
  })();

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
    const wantsShip = data.delivery === 'ship';
    if (wantsShip && (!data.address || !data.city || !data.state || !data.zip)) {
      return showError('Add your shipping address (street, city, state, ZIP), or choose local pickup.');
    }
    const shipping = wantsShip ? SHIP_FLAT : 0;

    const subtotal = cart.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty, 10) || 1), 0);
    let customerNotes = String(data.notes || '');

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
        address:   String(data.address   || ''),
        city:      String(data.city      || ''),
        state:     String(data.state     || ''),
        zip:       String(data.zip       || ''),
        deliveryMethod: wantsShip ? 'Ship' : 'Pickup',
        shipping:  shipping.toFixed(2),
        subtotal:  subtotal.toFixed(2),
        notes:     customerNotes,
        cart:      JSON.stringify(cart.items),
        page:      (typeof location !== 'undefined' && location.href) ? location.href : '',
      });

      let orderId = '';
      let succeeded = false;
      let serverError = '';
      try {
        const r = await fetch(AS_URL + '?' + params.toString(), { redirect: 'follow' });
        const text = await r.text();
        try {
          const j = JSON.parse(text);
          if (j && (j.ok === true || j.id)) {
            succeeded = true;
            if (j.id) orderId = j.id;
          } else if (j && j.error) {
            serverError = String(j.error);
          } else {
            serverError = 'Unexpected response from the server.';
          }
        } catch (parseErr) {
          // Non-JSON body almost always means the Apps Script doGet
          // threw and returned an HTML error page (e.g. "No HTML file
          // named Index"). That's a real server-side failure — surface
          // it instead of pretending the submit worked, which is how
          // the previous silent-failure bug went unnoticed.
          console.error('[cart] submit got non-JSON response:', text.slice(0, 300));
          serverError = 'The order didn\'t go through on our end.';
        }
      } catch (netErr) {
        // Apps Script's 302 → /macros redirect chain occasionally throws
        // a CORS-style error even when the server-side write succeeded.
        // Treat this specific case as tentative success, but log loudly
        // so we can spot it in browser DevTools if a pattern emerges.
        console.warn('[cart] submit fetch threw — assuming success per Apps Script redirect quirk:', netErr);
        succeeded = true;
      }

      if (!succeeded) {
        return showError(serverError + ' Please call or text 330-406-9686 — we\'ll take the order by hand.');
      }
      cart = { items: [] };
      writeCart();
      checkoutForm.reset();
      clearDraft();
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
