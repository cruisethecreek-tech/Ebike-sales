// The financing page advertises a consumer lease-to-own agreement, so what it
// says is not just copy — it is a representation about a credit-like product
// made on behalf of a merchant.
//
// Two ways this page can go wrong, and both are locked down here:
//
//   1. Snap's required disclosures go missing. They must appear verbatim, not
//      paraphrased into something friendlier.
//   2. Someone "improves" the copy into claims we cannot support — an APR, a
//      0% offer, a weekly payment figure, a promise of approval. None of that
//      is in the merchant material we were given, and a lease-to-own
//      agreement is not a loan.
//
// The site also must not blur Snap into Bridge the Gap. Bridge the Gap is our
// own no-credit-check program; Snap is "subject to underwriting". Attaching
// Bridge the Gap's terms to Snap would be a false promise to exactly the
// riders least able to absorb one.
const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (n, c, e = '') => {
  console.log((c ? 'PASS  ' : 'FAIL  ') + n + (e ? '  ' + e : ''));
  if (!c) fails++;
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const page = read('financing.html');
// Comments are guidance for whoever edits next; they are not what a customer
// reads, so claims are checked against the rendered markup only.
// Comments, CSS and scripts are all invisible to a customer. Leaving CSS in
// made a claim check fire on "width:100%", which contains "0%" — the check was
// wrong, not the copy.
const visible = page
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '');

// ── Snap's required disclosures, verbatim ────────────────────────────────
ok(
  'the lease-to-own provider is named exactly as Snap requires',
  visible.includes('The advertised service is a lease-to-own agreement provided by Snap RTO LLC.')
);

ok(
  'the approval range and its conditions are stated in full',
  visible.includes(
    'Approval amounts vary from $300 to $5,000, subject to underwriting, and apply only to the'
  ) && /cash price of leased items\./.test(visible),
  'the "subject to underwriting" and "cash price" qualifiers are not optional'
);

ok(
  'the page says who is and is not the lessor',
  /participating merchant, not the lender or lessor/.test(visible)
);

// ── Claims we have no basis for ──────────────────────────────────────────
const forbidden = [
  [/\bAPR\b/i, 'an APR'],
  [/guaranteed approval|everyone is approved|instant approval/i, 'a guaranteed-approval claim'],
  [/\$\d+(\.\d\d)?\s*(a|per)\s*(week|month)[\s\S]{0,200}Snap/i, 'a Snap payment figure'],
];
for (const [re, what] of forbidden) {
  ok(`the page makes no claim about ${what}`, !re.test(visible), 'not in the merchant material');
}

// "0%" is allowed to appear, but ONLY while being denied. A blunt ban would
// fail the very sentence that protects the rider ("not a loan and not 0%
// financing"), so check the polarity instead of the presence.
{
  const hits = [...visible.matchAll(/(?<!\d)0\s*%|zero percent|interest[- ]free/gi)];
  const affirmative = hits.filter((m) => !/\bnot\s+$/i.test(visible.slice(Math.max(0, m.index - 12), m.index)));
  ok(
    'the page never offers 0% / interest-free, only denies it',
    affirmative.length === 0,
    affirmative.length ? visible.slice(affirmative[0].index - 60, affirmative[0].index + 30) : `${hits.length} denied mention(s)`
  );
}

// Same shape of problem: "no credit checks" is true of Bridge the Gap and
// false of Snap. What matters is not whether the phrase appears near the word
// Snap, but whether it sits inside the Bridge the Gap block.
{
  const alt = (visible.match(/<div class="alt">[\s\S]*?<\/div>/) || [''])[0];
  const outside = visible.replace(alt, '');
  ok(
    'no-credit-check is claimed only inside the Bridge the Gap block',
    !/no credit check/i.test(outside) && /no credit checks/i.test(alt),
    'Snap approval is subject to underwriting; promising otherwise would mislead'
  );
}

// ── It must not undersell the cost ───────────────────────────────────────
ok(
  'the page says plainly that leasing costs more than paying cash',
  /costs more than paying the cash price/i.test(visible),
  'a rider deciding between cash and a lease needs this before they sign, not after'
);

ok(
  'it tells the rider to read the total before signing',
  /total you'll pay/i.test(visible) && /before you sign/i.test(visible)
);

ok(
  'it says approval is Snap’s decision, not ours',
  /subject to (their|underwriting)/i.test(visible)
);

// ── Bridge the Gap stays a distinct offer ────────────────────────────────
ok(
  'a declined applicant is pointed at Bridge the Gap',
  /bridge-the-gap\.html/.test(visible) && /Not approved/i.test(visible)
);

ok(
  'Bridge the Gap’s no-credit-check terms are attributed to Bridge the Gap, not Snap',
  /Bridge the Gap[\s\S]{0,300}no credit checks/i.test(visible),
  'the two programs serve different riders and must not be blurred'
);

// ── The apply paths actually work ────────────────────────────────────────
ok(
  'the merchant ID appears so an application is credited to the shop',
  (visible.match(/120580/g) || []).length >= 2,
  'the generic Snap link carries no merchant ID, so the rider has to supply it'
);

ok(
  'the SMS link uses a query separator, not an ampersand',
  /href="sms:48078\?&amp;body=120580"/.test(visible),
  'sms:48078&body=... silently drops the prefilled code on both iOS and Android'
);

ok(
  'the outbound Snap link does not leak referrer privileges',
  /snapfinance\.com[^"]*"[^>]*rel="[^"]*noopener/.test(visible)
);

// ── Every entry point reaches the page ───────────────────────────────────
const entryPoints = [
  'shop.html', 'jasion.html', 'heybike.html',
  'mokwheel.html', 'mooncool.html', 'velotric.html',
];
for (const f of entryPoints) {
  ok(`${f} links to the financing page`, /href="financing\.html"/.test(read(f)));
}

ok(
  'the financing page is reachable from the site menu',
  /url: 'financing\.html'/.test(read('site-enhance.js')),
  'per-page .top-nav is hidden by site-enhance.js; NAV_MENU is the real navigation'
);

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
