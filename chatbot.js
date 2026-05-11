// chatbot.js
// Cruise the Creek customer chat widget. Drop-in: just add
//   <script src="chatbot.js" defer></script>
// before </body> on any page. Self-contained — no other deps. Styling
// is injected at runtime so the host page doesn't need a stylesheet.
//
// Flow:
//   • Renders a forest-and-tan chat bubble bottom-right.
//   • Click to open a panel. Type a message → POST to /api/chat with
//     conversation history → render reply, scroll, persist.
//   • localStorage carries history across reloads (per origin).
//   • Backed by the Vercel function at api/chat.js (which talks to
//     Anthropic and pulls the latest CMS as context).

(function () {
  if (window.__ctcChatLoaded) return;
  window.__ctcChatLoaded = true;

  const API_URL     = 'https://ebike-sales-nu.vercel.app/api/chat';
  const VISITOR_URL = 'https://script.google.com/macros/s/AKfycbxjg2ZsPCZNsmJEStYA0bRdsnkm4nNS-m-HNhm_Gin56VIVeYWVRE5j51j30zVHhb4PmQ/exec';
  const CMS_URL     = VISITOR_URL + '?page=chat'; // for mascot config
  const STORE_KEY   = 'ctc:chat:history:v1';
  const SESSION_KEY = 'ctc:chat:session:v1';
  const VISITOR_KEY = 'ctc:chat:visitor:v1';
  const MASCOT_KEY  = 'ctc:chat:mascot:v1';
  const MAX_LOCAL   = 12;     // last N turns we keep client-side (server caps too)

  // Default mascot identity. Overridden at runtime by SiteConfig keys
  // (mascot_name, mascot_avatar_url, mascot_greeting, mascot_bio).
  // Pat: pick a name + upload the bear image → paste into the Sheet,
  // no code change needed. Defaults below are the unbranded fallback.
  let MASCOT = readMascot() || {
    name:      'Creek Concierge',
    avatarUrl: '',  // empty → "CC" letter avatar
    greeting:  "Hey! I'm the Creek Concierge — ask me anything about rentals, bikes, services, or the trails. What's on your mind?",
    bio:       'Usually replies right away',
  };
  let BRAND_NAME  = MASCOT.name;
  let GREETING    = MASCOT.greeting;

  function readMascot() {
    try { return JSON.parse(localStorage.getItem(MASCOT_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeMascot(m) {
    try { localStorage.setItem(MASCOT_KEY, JSON.stringify(m)); }
    catch (e) {}
  }

  // Resolve a mascot avatar URL — bare filename → /media/ prefix,
  // full URL → kept as-is. Mirrors the resolveImg pattern used
  // elsewhere on the site.
  function mascotUrl(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^(https?:|data:)/.test(s)) return s;
    return 'media/' + s.replace(/^(media|images)\//, '');
  }

  // Fetch the mascot config from the CMS once per panel open. Cache
  // in localStorage so repeat opens don't re-fetch. Updates the chat
  // header avatar / name / greeting in place if the mascot has been
  // configured since last fetch.
  function refreshMascot() {
    fetch(CMS_URL, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        const site = (d && d.site) || {};
        const m = {
          name:      String(site.mascot_name       || '').trim() || 'Creek Concierge',
          avatarUrl: mascotUrl(site.mascot_avatar_url),
          greeting:  String(site.mascot_greeting   || '').trim() ||
            "Hey! I'm " + (site.mascot_name || 'the Creek Concierge') + " — ask me anything about rentals, bikes, services, or the trails. What's on your mind?",
          bio:       String(site.mascot_bio        || '').trim() || 'Usually replies right away',
        };
        MASCOT = m;
        BRAND_NAME = m.name;
        GREETING = m.greeting;
        writeMascot(m);
        applyMascot();
      })
      .catch(err => console.warn('[chatbot] mascot fetch failed:', err));
  }

  // Apply the current MASCOT to the DOM. Called after fetch + on each
  // panel open (in case the user has multiple tabs / cache shifted).
  function applyMascot() {
    const av = panel && panel.querySelector('.avatar');
    if (av) {
      if (MASCOT.avatarUrl) {
        av.innerHTML = '<img src="' + MASCOT.avatarUrl + '" alt="' + escape(MASCOT.name) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'CC\'}))">';
      } else {
        av.textContent = (MASCOT.name || 'CC').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'CC';
      }
    }
    const nameEl = panel && panel.querySelector('.who strong');
    if (nameEl) nameEl.textContent = MASCOT.name;
    const bioEl = panel && panel.querySelector('.who .status');
    if (bioEl) bioEl.textContent = MASCOT.bio;
  }

  // Visitor persists across reloads. New device/browser → new intake.
  function readVisitor() {
    try { return JSON.parse(localStorage.getItem(VISITOR_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeVisitor(v) {
    try { localStorage.setItem(VISITOR_KEY, JSON.stringify(v)); }
    catch (e) {}
  }

  // Stable per-visitor ID so Pat can group conversations in the
  // Chat_Logs Sheet tab. New devices/browsers get their own. Survives
  // reloads but resets when localStorage is cleared.
  function sessionId() {
    try {
      let s = localStorage.getItem(SESSION_KEY);
      if (!s) {
        s = 'cs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(SESSION_KEY, s);
      }
      return s;
    } catch (e) { return 'cs-anon'; }
  }

  // ── Styles ───────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
.ctc-chat-fab{
  position:fixed;right:20px;
  /* Sits above typical sticky CTA bars (~76px tall on home/rentals) with
     a comfortable gap. Falls back to safe-area-inset on iOS notch devices. */
  bottom:calc(96px + env(safe-area-inset-bottom, 0px));
  z-index:9998;
  width:60px;height:60px;border-radius:50%;
  background:#2D4A32;color:#C9A96E;border:none;cursor:pointer;
  box-shadow:0 12px 32px rgba(45,74,50,.32),0 2px 8px rgba(0,0,0,.18);
  display:flex;align-items:center;justify-content:center;
  transition:transform .2s ease,box-shadow .2s ease;
}
.ctc-chat-fab:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(45,74,50,.4)}
.ctc-chat-fab svg{width:26px;height:26px;stroke:currentColor;fill:none;stroke-width:2}
.ctc-chat-fab.is-open svg.icon-chat{display:none}
.ctc-chat-fab:not(.is-open) svg.icon-close{display:none}
.ctc-chat-fab .dot{
  position:absolute;top:8px;right:8px;width:10px;height:10px;border-radius:50%;
  background:#C9A96E;box-shadow:0 0 0 2px #2D4A32;animation:ctc-pulse 2s ease-in-out infinite;
}
.ctc-chat-fab.is-open .dot{display:none}
@keyframes ctc-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.6}}

.ctc-chat-panel{
  position:fixed;right:20px;
  bottom:calc(170px + env(safe-area-inset-bottom, 0px));
  z-index:9999;
  width:min(360px, calc(100vw - 32px));height:min(540px, calc(100vh - 200px));
  background:#fbf7ef;border-radius:14px;
  box-shadow:0 24px 64px rgba(26,46,28,.32),0 4px 14px rgba(0,0,0,.12);
  display:none;flex-direction:column;overflow:hidden;
  font-family:'DM Sans',-apple-system,system-ui,sans-serif;color:#1a1a1a;
  transform-origin:bottom right;animation:ctc-pop .2s ease-out;
}
.ctc-chat-panel.is-open{display:flex}
@keyframes ctc-pop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}

.ctc-chat-head{
  background:#2D4A32;color:#fff;padding:14px 18px;
  display:flex;align-items:center;gap:10px;flex-shrink:0;
}
.ctc-chat-head .avatar{
  width:36px;height:36px;border-radius:50%;background:#C9A96E;color:#1a2e1c;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  font-family:'Bebas Neue',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:.04em;
  flex-shrink:0;
}
.ctc-chat-head .avatar img{
  width:100%;height:100%;object-fit:cover;display:block;
}
.ctc-chat-head .who{flex:1;min-width:0}
.ctc-chat-head .who strong{display:block;font-size:.95rem;font-weight:700;letter-spacing:.02em}
.ctc-chat-head .who .status{font-size:.72rem;color:rgba(255,255,255,.65);display:flex;align-items:center;gap:5px}
.ctc-chat-head .who .status::before{content:'';width:7px;height:7px;border-radius:50%;background:#7dc97d}
.ctc-chat-head .reset{
  background:transparent;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:.7rem;
  letter-spacing:.1em;text-transform:uppercase;padding:6px;font-family:inherit;font-weight:600;
}
.ctc-chat-head .reset:hover{color:#C9A96E}

.ctc-chat-body{flex:1;overflow-y:auto;padding:16px;background:#fbf7ef;display:flex;flex-direction:column;gap:10px}
.ctc-chat-body[hidden],.ctc-chat-foot[hidden],.ctc-chat-note[hidden]{display:none}
.ctc-msg{max-width:85%;padding:10px 14px;border-radius:14px;line-height:1.5;font-size:.92rem;word-wrap:break-word;white-space:pre-wrap}
.ctc-msg.user{align-self:flex-end;background:#2D4A32;color:#fff;border-bottom-right-radius:4px}
.ctc-msg.bot{align-self:flex-start;background:#fff;color:#1a1a1a;
  border:1px solid rgba(0,0,0,.06);border-bottom-left-radius:4px;
  box-shadow:0 2px 6px rgba(0,0,0,.04)}
.ctc-msg.err{align-self:flex-start;background:#fdecea;color:#7d2b22;border:1px solid #f5b9b1;border-bottom-left-radius:4px}
.ctc-typing{align-self:flex-start;background:#fff;color:#7a7a7a;padding:10px 14px;border-radius:14px;
  border:1px solid rgba(0,0,0,.06);border-bottom-left-radius:4px;display:inline-flex;gap:4px}
.ctc-typing span{width:7px;height:7px;border-radius:50%;background:#6B8F71;animation:ctc-dot 1.2s ease-in-out infinite}
.ctc-typing span:nth-child(2){animation-delay:.15s}
.ctc-typing span:nth-child(3){animation-delay:.3s}
@keyframes ctc-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}

.ctc-msg a{color:#a98843;font-weight:700;border-bottom:1px solid rgba(169,136,67,.35)}
.ctc-msg.user a{color:#C9A96E;border-bottom-color:rgba(201,169,110,.5)}

.ctc-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px;padding-left:2px;align-self:flex-start;max-width:90%;
  animation:ctc-chip-in .25s ease-out}
@keyframes ctc-chip-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.ctc-chip{
  background:#fff;color:#2D4A32;border:1px solid #C9A96E;border-radius:99px;
  padding:7px 14px;font-size:.84rem;font-weight:700;letter-spacing:.02em;
  cursor:pointer;font-family:inherit;transition:all .15s ease;line-height:1.2;
}
.ctc-chip:hover{background:#C9A96E;color:#1a2e1c}
.ctc-chip:active{transform:scale(.96)}

.ctc-chat-foot{
  background:#fff;border-top:1px solid rgba(0,0,0,.08);padding:10px 12px;
  display:flex;gap:8px;align-items:flex-end;flex-shrink:0;
}
.ctc-chat-input{
  flex:1;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:9px 12px;
  font-family:inherit;font-size:.92rem;color:#1a1a1a;resize:none;max-height:120px;min-height:40px;
  line-height:1.4;background:#fbf7ef;outline:none;transition:border-color .15s ease;
}
.ctc-chat-input:focus{border-color:#6B8F71}
.ctc-chat-send{
  width:40px;height:40px;border-radius:50%;background:#C9A96E;color:#1a2e1c;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s ease;
}
.ctc-chat-send:hover{background:#dbb978}
.ctc-chat-send:disabled{opacity:.4;cursor:not-allowed}
.ctc-chat-send svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.4}
.ctc-chat-note{font-size:.7rem;color:#7a7a7a;text-align:center;padding:4px 12px 8px;background:#fff}

/* ── PRE-CHAT INTAKE FORM ─────────────────────────────────── */
.ctc-intake{flex:1;overflow-y:auto;padding:20px 22px 22px;background:#fbf7ef;
  display:flex;flex-direction:column;gap:14px;animation:ctc-pop .2s ease-out}
.ctc-intake-eyebrow{font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;font-weight:800;color:#a98843}
.ctc-intake-title{font-family:'Bebas Neue','DM Sans',sans-serif;font-size:1.25rem;letter-spacing:.02em;
  color:#2D4A32;line-height:1.15;text-transform:uppercase}
.ctc-intake-sub{font-size:.86rem;color:#4a4a4a;line-height:1.55;margin-bottom:4px}
.ctc-intake-field{display:flex;flex-direction:column;gap:5px}
.ctc-intake-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ctc-intake-label{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:#2D4A32}
.ctc-intake-input,.ctc-intake-select{
  width:100%;border:1px solid rgba(45,74,50,.18);border-radius:8px;
  padding:9px 12px;font-family:inherit;font-size:.92rem;color:#1a1a1a;background:#fff;
  transition:border-color .15s ease;
}
.ctc-intake-input:focus,.ctc-intake-select:focus{outline:none;border-color:#6B8F71}
.ctc-intake-select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,#a98843 50%),linear-gradient(135deg,#a98843 50%,transparent 50%);
  background-position:calc(100% - 18px) 50%,calc(100% - 12px) 50%;background-size:6px 6px,6px 6px;background-repeat:no-repeat;padding-right:32px}
.ctc-intake-error{font-size:.78rem;color:#c44a3a;line-height:1.4;display:none}
.ctc-intake-error.show{display:block}
.ctc-intake-submit{
  background:#2D4A32;color:#C9A96E;border:none;cursor:pointer;
  padding:12px 16px;border-radius:8px;font-family:inherit;font-weight:800;
  font-size:.9rem;letter-spacing:.08em;text-transform:uppercase;margin-top:6px;
  transition:background .15s ease,transform .1s ease;
}
.ctc-intake-submit:hover{background:#1a2e1c}
.ctc-intake-submit:active{transform:scale(.98)}
.ctc-intake-submit:disabled{opacity:.5;cursor:not-allowed}
.ctc-intake-privacy{font-size:.68rem;color:#7a7a7a;line-height:1.4;text-align:center;margin-top:2px}
.ctc-intake-skip{background:transparent;border:none;color:#7a7a7a;cursor:pointer;
  font-family:inherit;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;
  padding:4px;margin-top:-4px;text-decoration:underline}
.ctc-intake-skip:hover{color:#2D4A32}

@media(max-width:480px){
  .ctc-chat-panel{right:12px;left:12px;width:auto;bottom:calc(160px + env(safe-area-inset-bottom, 0px));height:calc(100vh - 200px)}
  .ctc-chat-fab{right:14px;bottom:calc(88px + env(safe-area-inset-bottom, 0px))}
}
`;
  document.head.appendChild(css);

  // ── DOM ──────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.className = 'ctc-chat-fab';
  fab.setAttribute('aria-label', 'Open chat with Creek Concierge');
  fab.innerHTML = `
    <span class="dot"></span>
    <svg class="icon-chat" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    <svg class="icon-close" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
  `;

  const panel = document.createElement('div');
  panel.className = 'ctc-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', BRAND_NAME);
  panel.innerHTML = `
    <header class="ctc-chat-head">
      <div class="avatar">CC</div>
      <div class="who">
        <strong>${BRAND_NAME}</strong>
        <span class="status">Usually replies right away</span>
      </div>
      <button class="reset" type="button" aria-label="Start over">Reset</button>
    </header>

    <!-- Pre-chat intake form. Shown only on first open (gated by
         localStorage). Submits to Apps Script ?action=chatVisitor,
         then hides itself and reveals the chat body/footer. -->
    <form class="ctc-intake" novalidate>
      <span class="ctc-intake-eyebrow">Quick intro</span>
      <h2 class="ctc-intake-title">Let's match you with the right answer</h2>
      <p class="ctc-intake-sub">Drop a few details so we know who's reaching out and can follow up if the chat needs a hand-off.</p>

      <div class="ctc-intake-row">
        <div class="ctc-intake-field">
          <label class="ctc-intake-label" for="ctc-intake-first">First name</label>
          <input id="ctc-intake-first" class="ctc-intake-input" type="text" autocomplete="given-name" required>
        </div>
        <div class="ctc-intake-field">
          <label class="ctc-intake-label" for="ctc-intake-last">Last name</label>
          <input id="ctc-intake-last" class="ctc-intake-input" type="text" autocomplete="family-name" required>
        </div>
      </div>

      <div class="ctc-intake-field">
        <label class="ctc-intake-label" for="ctc-intake-email">Email</label>
        <input id="ctc-intake-email" class="ctc-intake-input" type="email" autocomplete="email" placeholder="you@example.com">
      </div>

      <div class="ctc-intake-field">
        <label class="ctc-intake-label" for="ctc-intake-phone">Phone</label>
        <input id="ctc-intake-phone" class="ctc-intake-input" type="tel" autocomplete="tel" placeholder="330-555-1234">
      </div>

      <div class="ctc-intake-field">
        <label class="ctc-intake-label" for="ctc-intake-reason">Reason for chat</label>
        <select id="ctc-intake-reason" class="ctc-intake-select" required>
          <option value="">— pick one —</option>
          <option>Booking a rental</option>
          <option>Service or repair</option>
          <option>Looking to buy</option>
          <option>Just a question</option>
          <option>Other</option>
        </select>
      </div>

      <div class="ctc-intake-error" id="ctc-intake-error"></div>

      <button class="ctc-intake-submit" type="submit">Start chat →</button>
      <div class="ctc-intake-privacy">Stored privately and used only to follow up with you about Cruise the Creek. Email or phone — one is enough.</div>
    </form>

    <div class="ctc-chat-body" aria-live="polite" hidden></div>
    <div class="ctc-chat-foot" hidden>
      <textarea class="ctc-chat-input" rows="1" placeholder="Ask about rentals, bikes, services…" aria-label="Type a message"></textarea>
      <button class="ctc-chat-send" type="button" aria-label="Send">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
    <div class="ctc-chat-note" hidden>Replies powered by Claude. Not always perfect — text Sales at 330-406-9682 for the human team.</div>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(fab);

  // Paint cached mascot on initial mount so returning visitors see
  // the bear/name instantly. The refresh fires on first panel open
  // to keep idle pages from making an Apps Script call.
  applyMascot();

  const body   = panel.querySelector('.ctc-chat-body');
  const foot   = panel.querySelector('.ctc-chat-foot');
  const note   = panel.querySelector('.ctc-chat-note');
  const input  = panel.querySelector('.ctc-chat-input');
  const send   = panel.querySelector('.ctc-chat-send');
  const reset  = panel.querySelector('.reset');
  const intake = panel.querySelector('.ctc-intake');
  const intakeErr = panel.querySelector('#ctc-intake-error');

  // ── State ────────────────────────────────────────────────────
  let history = readHistory();
  let visitor = readVisitor();
  let busy    = false;

  // Reveal chat surface (body + footer + note), hide intake form.
  // Called after a successful intake submit OR immediately on open if
  // the visitor has already filled the form on a previous visit.
  function showChat() {
    intake.style.display = 'none';
    body.hidden = false;
    foot.hidden = false;
    note.hidden = false;
    if (!body.children.length) paintHistory();
    setTimeout(() => input.focus(), 60);
  }
  function showIntake() {
    intake.style.display = '';
    body.hidden = true;
    foot.hidden = true;
    note.hidden = true;
    setTimeout(() => panel.querySelector('#ctc-intake-first').focus(), 60);
  }

  // ── Intake form submission ───────────────────────────────────
  async function submitIntake(e) {
    e.preventDefault();
    const first  = panel.querySelector('#ctc-intake-first').value.trim();
    const last   = panel.querySelector('#ctc-intake-last').value.trim();
    const email  = panel.querySelector('#ctc-intake-email').value.trim();
    const phone  = panel.querySelector('#ctc-intake-phone').value.trim();
    const reason = panel.querySelector('#ctc-intake-reason').value.trim();
    intakeErr.classList.remove('show');

    const missing = [];
    if (!first)  missing.push('first name');
    if (!last)   missing.push('last name');
    if (!email && !phone) missing.push('email or phone');
    if (!reason) missing.push('reason');
    if (missing.length) {
      intakeErr.textContent = 'Please add: ' + missing.join(', ') + '.';
      intakeErr.classList.add('show');
      return;
    }

    const submitBtn = panel.querySelector('.ctc-intake-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting…';

    const sid = sessionId();
    const payload = { first, last, email, phone, reason };

    // Fire-and-forget POST so a slow Apps Script doesn't block the
    // chat from opening. The lead is also baked into localStorage
    // for the bot to read on its first call.
    try {
      const params = new URLSearchParams({
        action:    'chatVisitor',
        sessionId: sid,
        first, last, email, phone, reason,
        page:      (typeof location !== 'undefined' && location.href) ? location.href : '',
      });
      fetch(VISITOR_URL + '?' + params.toString(), { method: 'GET', mode: 'no-cors' })
        .catch(err => console.warn('[chatbot] visitor log failed:', err));
    } catch (e) { /* swallow */ }

    visitor = payload;
    writeVisitor(payload);
    showChat();
  }

  function readHistory() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(-MAX_LOCAL) : [];
    } catch (e) { return []; }
  }
  function writeHistory() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-MAX_LOCAL))); } catch (e) {}
  }

  function escape(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Render Markdown-lite — preserves links, line breaks, basic bold/italic
  // without pulling a parser. Anything else gets escaped.
  function renderMsg(text) {
    let s = escape(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>');
    // Auto-link URLs (raw and existing page references like rentals.html)
    s = s.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\b([a-z][a-z0-9-]+\.html)\b/g, '<a href="$1">$1</a>');
    return s;
  }

  // Pull the bot's quick-reply marker off the end of a message.
  // Convention (taught in the system prompt):
  //   [OPTIONS: First-time | Confident | Bridge the Gap | Other]
  // Returns { text, options } where text is the message with the marker
  // stripped, and options is an array of strings (or null if no marker).
  function parseOptions(raw) {
    const m = String(raw || '').match(/\n?\s*\[OPTIONS:\s*([^\]]+)\]\s*$/i);
    if (!m) return { text: raw, options: null };
    const opts = m[1].split('|').map(s => s.trim()).filter(Boolean);
    if (!opts.length) return { text: raw, options: null };
    return { text: raw.slice(0, m.index).trim(), options: opts };
  }

  // Remove chip rows from any older bot messages — only the LATEST bot
  // bubble should have active chips. Called whenever a new user input
  // lands (typed or chip tap) so the conversation history doesn't
  // accumulate clickable chips that no longer make sense.
  function clearOldChips() {
    body.querySelectorAll('.ctc-chips').forEach(el => el.remove());
  }

  function renderChips(opts) {
    if (!opts || !opts.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'ctc-chips';
    opts.forEach(o => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctc-chip';
      b.textContent = o;
      b.addEventListener('click', () => {
        if (busy) return;
        input.value = o;
        submit();   // submit() calls clearOldChips before sending
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function paintHistory() {
    body.innerHTML = '';
    if (!history.length) {
      addBot(GREETING, /*persist*/ false);
      return;
    }
    history.forEach(m => addBubble(m.role === 'user' ? 'user' : 'bot', m.content));
    scrollDown();
  }

  function addBubble(kind, text) {
    const el = document.createElement('div');
    el.className = 'ctc-msg ' + kind;
    if (kind === 'user' || kind === 'err') {
      el.innerHTML = kind === 'user' ? escape(text) : renderMsg(text);
    } else {
      // Bot message — strip the [OPTIONS: ...] marker before display,
      // then render chip row underneath if there were options.
      const { text: cleanText, options } = parseOptions(text);
      el.innerHTML = renderMsg(cleanText);
      body.appendChild(el);
      renderChips(options);
      scrollDown();
      return el;
    }
    body.appendChild(el);
    scrollDown();
    return el;
  }
  function addUser(text)        { history.push({ role: 'user', content: text }); writeHistory(); return addBubble('user', text); }
  function addBot(text, persist){ if (persist !== false) { history.push({ role: 'assistant', content: text }); writeHistory(); } return addBubble('bot', text); }
  function addErr(text)         { return addBubble('err', text); }

  function showTyping() {
    const t = document.createElement('div');
    t.className = 'ctc-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(t);
    scrollDown();
    return t;
  }
  function scrollDown(){ body.scrollTop = body.scrollHeight; }

  // ── Send ─────────────────────────────────────────────────────
  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    autosize();
    send.disabled = true;
    // Strip any chips from previous bot messages — only the LATEST
    // assistant reply should have tappable options at any time.
    clearOldChips();
    addUser(text);
    const typing = showTyping();

    try {
      const res = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:   text,
          // Send the prior history (without the just-added user msg).
          history:   history.slice(0, -1),
          // Logging context — server logs each turn to Chat_Logs.
          sessionId: sessionId(),
          page:      (typeof location !== 'undefined' && location.href) ? location.href : '',
          // Visitor info captured by the pre-chat intake form. Injected
          // into the bot's system prompt so it greets by name and uses
          // their stated reason as context.
          visitor:   visitor || null,
        }),
      });
      typing.remove();
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        addErr(j.error || "I'm having trouble right now — text Sales at 330-406-9682 and we'll help you out.");
      } else {
        const j = await res.json();
        // Server returns updated history including the assistant reply.
        // We trust it over our local push so the two stay aligned.
        if (Array.isArray(j.history)) {
          history = j.history.slice(-MAX_LOCAL);
          writeHistory();
          addBubble('bot', j.reply || '');
        } else {
          addBot(j.reply || '');
        }
      }
    } catch (err) {
      typing.remove();
      console.warn('[chatbot] fetch failed', err);
      addErr("Couldn't reach the chat service. Text Sales at 330-406-9682 and we'll help out.");
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  function autosize(){
    input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px';
  }

  // ── Wire events ──────────────────────────────────────────────
  let mascotFetched = false;
  fab.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('is-open');
    fab.classList.toggle('is-open', isOpen);
    fab.setAttribute('aria-label', isOpen ? ('Close chat with ' + MASCOT.name) : ('Open chat with ' + MASCOT.name));
    if (isOpen) {
      // Refresh mascot from CMS on first open per page-load (deferred
      // here so idle pages don't ping Apps Script).
      if (!mascotFetched) { mascotFetched = true; refreshMascot(); }
      // Gate: brand-new visitor → intake form. Returning visitor → chat.
      if (visitor && visitor.first) showChat(); else showIntake();
    }
  });
  intake.addEventListener('submit', submitIntake);
  send.addEventListener('click', submit);
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  reset.addEventListener('click', () => {
    if (!confirm('Clear the chat? (Your contact info stays saved — only the conversation is reset.)')) return;
    history = [];
    writeHistory();
    paintHistory();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) fab.click();
  });
})();
