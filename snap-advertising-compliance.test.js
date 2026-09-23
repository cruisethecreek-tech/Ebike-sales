// Snap's advertising rules, enforced.
//
// Source: "Your guide to lease-to-own financing from Snap — Important
// information for Snap Partners" (V10, June 2025), the merchant packet. Page
// references below are that document's.
//
// This is not style policing. Snap lists "creating custom marketing material
// or online content without Snap approval" as a Merchant Prohibited Activity,
// and says failure to get preapproval "would constitute a breach of your
// agreement" (p.13). The words on the page are contractual.
//
// The first version of this page broke five of these rules at once — it was
// titled "Financing", said "no credit checks", described a second finance
// product alongside Snap's, offered to lease a service, and denied being "0%
// financing" in prohibited terms. Each of those is asserted against here so it
// cannot come back through a well-meaning copy edit.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const PAGE = 'ownership-options.html';
const raw = read(PAGE);

// Comments, CSS and scripts are invisible to a customer, and CSS is full of
// "100%" and "border-radius:50%" that trip naive claim checks.
const markup = raw
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '');
// What a customer actually reads, with entities resolved.
const prose = markup
  .replace(/<[^>]+>/g, ' ')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

// ── Prohibited language (guide p.4–5) ────────────────────────────────────
// Each pair is the banned term and the approved phrase it must give way to.
const prohibited = [
  [/no credit check/i, '"All credit types welcome to apply", with its explanation'],
  [/\binterest\b|finance charge/i, '"cost of lease" / "lease charge" / "factor rate"'],
  [/\bpay ?off\b|\brepay/i, '"acquire ownership" / "cost to acquire ownership"'],
  [/same as cash|cash payoff/i, '"lowest cost to acquire ownership" or "100-Day Option"'],
  [/early (payoff|repayment)/i, '"100-Day Option" / "Early Ownership" / "Early Buyout Option"'],
  [/down payment/i, '"processing fee" or "initial rental payment"'],
  [/loan amount|financing amount/i, '"invoice price"'],
  [/\b0\s*%|zero percent|interest[- ]free/i, 'nothing — do not frame a lease against a rate'],
];
for (const [re, instead] of prohibited) {
  const m = prose.match(re);
  ok(`prohibited language absent: ${re.source}`, !m,
     m ? `found "${m[0]}" — use ${instead}` : `use ${instead}`);
}

// Snap's product must never be called credit, a loan, or debt (p.15) — except
// where the page is explicitly denying it, which the guide asks us to do.
{
  // "credit" is legitimate in several places the guide itself uses it: credit
  // types, credit history, consumer reporting, and a credit or debit card as
  // an application requirement. What is banned is calling Snap's PRODUCT
  // credit — so match on the surrounding phrase, not the bare word.
  const legitimate = /credit (or debit )?card|credit types|credit history|credit report|credit bureau|reporting agenc/i;
  const hits = [...prose.matchAll(/\b(a loan|credit|debt)\b/gi)];
  const affirmed = hits.filter((m) => {
    if (legitimate.test(prose.slice(Math.max(0, m.index - 30), m.index + 30))) return false;
    return !/\bnot\s+$|\bnot\s+\w+\s+and\s+$/i.test(prose.slice(Math.max(0, m.index - 30), m.index));
  });
  ok('the page never calls Snap credit, a loan or debt except to deny it',
     affirmed.length === 0,
     affirmed.length ? prose.slice(affirmed[0].index - 60, affirmed[0].index + 30) : '');
}

// "financing" may only appear as "lease-to-own financing" or "Snap Finance" (p.14).
{
  const bare = [...prose.matchAll(/financ\w*/gi)].filter((m) => {
    const ctx = prose.slice(Math.max(0, m.index - 24), m.index + m[0].length + 6);
    return !/lease-to-own financing|Snap Finance|snapfinance\.com/i.test(ctx);
  });
  ok('"financing" never appears bare', bare.length === 0,
     bare.length ? prose.slice(bare[0].index - 40, bare[0].index + 20) : '');
}

// ── Page and link naming (p.15) ──────────────────────────────────────────
ok('the page is named for ownership options, not financing',
   /<title>Ownership Options \| Cruise the Creek<\/title>/.test(raw) &&
   /<h1>Ownership Options<\/h1>/.test(raw));

ok('the file itself is not named financing.html',
   !fs.existsSync(path.join(__dirname, 'financing.html')));

ok('the site menu link is named for ownership options',
   /label: 'Ownership Options', url: 'ownership-options\.html'/.test(read('site-enhance.js')),
   'NAV_MENU is the real navigation; per-page .top-nav is hidden site-wide');

// ── Required disclosures, verbatim ───────────────────────────────────────
// Referring to the 100-Day Option triggers this exact block (p.16).
const REQUIRED = [
  'The advertised service is a lease-to-own agreement provided by Snap RTO LLC.',
  'Lease-to-own financing is not available to residents of Minnesota, New Jersey and Wisconsin.',
  'Standard maximum lease term is 12-18 months.',
  'The 100-Day Option includes a cost of lease above the merchandise price.',
  'Approval amounts vary from $300 to $5,000, subject to underwriting',
];
for (const line of REQUIRED) {
  ok(`disclosure present verbatim: "${line.slice(0, 52)}…"`, prose.includes(line));
}

ok('Customer Care’s number is given for the 100-Day Option',
   /1-877-557-3769/.test(prose),
   'the guide requires the route to exercising it, not just its name');

// "All credit types welcome" must carry its explanation (p.16).
ok('the all-credit-types line carries its required explanation',
   /All credit types are welcome to apply/i.test(prose) &&
   /Not all applicants are approved\./.test(prose) &&
   /Snap obtains information from\s+consumer reporting agencies|Snap obtains information from consumer reporting agencies/.test(prose));

// Introducing the 100-Day Option obliges us to state the default too (p.5).
ok('the full-term plan is identified as the default alongside the early options',
   /Maximum-Term Plan/.test(prose) && /default/i.test(prose));

ok('the more-than-twice cost communication is present',
   /more than twice the cash\s+price/.test(prose) || /more than twice the cash price/.test(prose),
   'the guide requires this whenever the 100-Day Option is introduced');

ok('the right of surrender is explained',
   /end the lease at any time/i.test(prose) && /surrender/i.test(prose));

// ── No payment amounts or total costs (p.16) ─────────────────────────────
{
  // The ban is on LEASE payment figures ("as low as $39 per week"). Snap's own
  // eligibility rule — earn at least $750 a month — is an applicant
  // requirement quoted from p.10, not a payment quote, so it is exempted by
  // its context rather than by loosening the pattern.
  const amounts = [...prose.matchAll(/\$\s?\d[\d,.]*\s*(per|a|\/)\s*(week|month|payment)/gi)];
  const quotes = amounts.filter(
    (m) => !/earn at least\s*$/i.test(prose.slice(Math.max(0, m.index - 20), m.index))
  );
  ok('no periodic lease payment amount is quoted', quotes.length === 0,
     quotes.length ? prose.slice(quotes[0].index - 50, quotes[0].index + 30)
                   : 'lease payment figures need Snap express case-by-case consent');
}

// ── Services and product categories (p.11) ───────────────────────────────
ok('the page does not offer to lease a service',
   !/Creek Ready setup|tune-?up|inspection|calibration/i.test(prose),
   'Snap does not lease services; installation may be permitted only case by case');

// ── Two finance products must not be mixed (p.15) ────────────────────────
{
  const alt = (markup.match(/<div class="alt">[\s\S]*?<\/div>/) || [''])[0];
  const altProse = alt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok('Bridge the Gap is named as ours and separate from Snap',
     /our own[\s\S]{0,40}rent-to-own/i.test(altProse) && /nothing to do with Snap/i.test(altProse));
  ok('Bridge the Gap’s terms are not stated on the Snap page',
     !/\$\d+\s*(to|–|-)\s*\$\d+\s*a week/i.test(altProse) && !/bi-weekly payments/i.test(altProse),
     'the guide requires the two products to be presented separately');
}

// ── The apply paths still work ───────────────────────────────────────────
ok('the apply button uses the merchant-specific origination link',
   /href="https:\/\/bk\.snapfinance\.com\/origination\?paramId=[^"]+"/.test(markup),
   'a generic snapfinance.com landing URL credits the application to nobody');

ok('the superseded generic QR link is gone',
   !/utm_campaign=b2b_gwth_lto_table_tent/.test(markup));

ok('the SMS link uses a query separator, not an ampersand',
   /href="sms:48078\?&amp;body=120580"/.test(markup),
   'sms:48078&body=... silently drops the prefilled code on iOS and Android');

ok('the merchant ID is shown for the text and phone paths',
   (markup.match(/120580/g) || []).length >= 2);

ok('outbound Snap links do not leak referrer privileges',
   [...markup.matchAll(/<a[^>]*snapfinance\.com[^>]*>/g)]
     .every((m) => /rel="[^"]*noopener/.test(m[0])));

// ── Every entry point reaches the page, under the approved phrase ────────
for (const f of ['shop.html', 'jasion.html', 'heybike.html',
                 'mokwheel.html', 'mooncool.html', 'velotric.html']) {
  const src = read(f);
  ok(`${f} links to the ownership options page`,
     /href="ownership-options\.html"/.test(src) && !/financing\.html/.test(src));
  ok(`${f} uses the approved phrase in its callout`,
     /Lease-to-own financing from Snap/.test(src),
     'p.14 lists this as an approved phrase, word for word');
}

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
