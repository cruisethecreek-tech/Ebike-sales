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

  const API_URL    = 'https://ebike-sales-nu.vercel.app/api/chat';
  const STORE_KEY  = 'ctc:chat:history:v1';
  const MAX_LOCAL  = 12;     // last N turns we keep client-side (server caps too)
  const BRAND_NAME = 'Creek Concierge';
  const GREETING   = "Hey! I'm the Creek Concierge — ask me anything about rentals, bikes, services, or the trails. What's on your mind?";

  // ── Styles ───────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
.ctc-chat-fab{
  position:fixed;right:20px;bottom:20px;z-index:9998;
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
  position:fixed;right:20px;bottom:92px;z-index:9999;
  width:min(360px, calc(100vw - 32px));height:min(540px, calc(100vh - 120px));
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
  width:32px;height:32px;border-radius:50%;background:#C9A96E;color:#1a2e1c;
  display:flex;align-items:center;justify-content:center;
  font-family:'Bebas Neue',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:.04em;
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

@media(max-width:480px){
  .ctc-chat-panel{right:12px;left:12px;width:auto;bottom:84px;height:calc(100vh - 110px)}
  .ctc-chat-fab{right:14px;bottom:14px}
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
    <div class="ctc-chat-body" aria-live="polite"></div>
    <div class="ctc-chat-foot">
      <textarea class="ctc-chat-input" rows="1" placeholder="Ask about rentals, bikes, services…" aria-label="Type a message"></textarea>
      <button class="ctc-chat-send" type="button" aria-label="Send">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
    <div class="ctc-chat-note">Replies powered by Claude. Not always perfect — text Sales at 330-406-9682 for the human team.</div>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(fab);

  const body   = panel.querySelector('.ctc-chat-body');
  const input  = panel.querySelector('.ctc-chat-input');
  const send   = panel.querySelector('.ctc-chat-send');
  const reset  = panel.querySelector('.reset');

  // ── State ────────────────────────────────────────────────────
  let history = readHistory();
  let busy    = false;

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
    el.innerHTML = kind === 'user' ? escape(text) : renderMsg(text);
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
    addUser(text);
    const typing = showTyping();

    try {
      const res = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          // Send the prior history (without the just-added user msg).
          history: history.slice(0, -1),
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
  fab.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('is-open');
    fab.classList.toggle('is-open', isOpen);
    fab.setAttribute('aria-label', isOpen ? 'Close chat' : 'Open chat with Creek Concierge');
    if (isOpen) {
      if (!body.children.length) paintHistory();
      setTimeout(() => input.focus(), 60);
    }
  });
  send.addEventListener('click', submit);
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  reset.addEventListener('click', () => {
    if (!confirm('Clear the chat?')) return;
    history = [];
    writeHistory();
    paintHistory();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) fab.click();
  });
})();
