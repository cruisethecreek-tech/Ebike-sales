# Snap lease-to-own: what the merchant agreement lets us say

Source: **"Your guide to lease-to-own financing from Snap — Important
information for Snap Partners"**, V10, June 2025. Page numbers below are that
document's. Merchant ID **120580**.

This file exists because the words on `ownership-options.html` are contractual,
not editorial. Snap lists *"creating custom marketing material, online content,
or press releases without Snap approval"* as a **Merchant Prohibited Activity**
(p.18), and says failure to obtain preapproval *"would constitute a breach of
your agreement"* (p.13).

`snap-advertising-compliance.test.js` enforces everything below that can be
checked mechanically. Run it before touching any Snap-related copy.

---

## ⚠️ Before this page goes live

Three things need confirming with the Client Success Manager
(877-789-4384 · merchant@snapfinance.com). None of them are code problems.

1. **This page needs Snap's preapproval.** There is a carve-out on p.14: a
   business does *not* need approval if it *"simply state[s] on your website
   that you offer lease-to-own financing from Snap"*. `ownership-options.html`
   is well past a simple statement, so it needs sign-off before publishing.
   The brand-page callouts, which say only *"Lease-to-own financing from
   Snap"*, are within the carve-out on their own.

2. **E-bikes are not in the listed product categories.** p.11 approves
   Appliances, Furniture, Mattresses, Jewelry, Electronics, and Wheels and
   tires — for *consumer and household purposes only*. It also says Snap "may
   also approve certain products within or outside of these product categories".
   We were approved as a partner, so presumably e-bikes are covered, but get it
   in writing.

3. **Bridge the Gap sits on the same site as Snap.** p.15 requires two finance
   products to be presented separately, and says *"it is particularly important
   that Snap reviews and approves any website or advertising that describes a
   Snap product and another product on the same page."* The page now names
   Bridge the Gap as ours and states none of its terms, but the reviewer should
   see it.

---

## Language: use / never use (p.4–5)

| Never | Use instead |
|---|---|
| No credit check | All credit types welcome to apply *(+ explanation, below)* |
| Loan, credit, note, financing | Lease-to-own, lease-purchase, lease-to-own financing |
| Interest rate | Factor rate, lease factor, lease charge, rental charge |
| Interest, finance charge | Cost of lease |
| Same as cash, cash payoff | Lowest cost to acquire ownership, 100-Day Option |
| Early payoff, early repayment | 100-Day Option, Early Ownership, Early Buyout Option |
| Payoff, repay | Acquire ownership |
| Payoff amount | Cost to acquire ownership |
| Down payment | Processing fee, initial rental payment |
| Loan amount, financing amount | Invoice price |

**"Financing" alone is banned** (p.14). It may only appear as *lease-to-own
financing* or in the name *Snap Finance*.

**Page titles and page links** must be named *"ownership options"* or *"lease
purchase options"* (p.15) — which is why this page is `ownership-options.html`
and not `financing.html`.

**Never use a Snap logo or mark** unless it came from the Merchant Portal
(Resources → Documentation) (p.14).

### Phrases that drag required text along with them

- **"All credit types welcome to apply"** must be accompanied by, verbatim:
  > Not all applicants are approved. While no credit history is required, Snap
  > obtains information from consumer reporting agencies in connection with
  > applications, and your score with those agencies may be affected.

- **The 100-Day Option** triggers the disclosure block in the page footer
  (p.16), *and* obliges us to say the full-term plan is the default and that
  over it a customer will *"usually pay more than twice the cash price"* (p.5).

- **Any payment amount or total cost** — e.g. "as low as $39 per week" — needs
  Snap's express, case-by-case consent and carries its own long disclosure
  (p.16–17). **We quote none, and should not start.** The $750/month figure on
  the page is Snap's applicant *income requirement*, not a payment.

## Facts we may state (all sourced)

- Approvals **$300–$5,000**, subject to underwriting, applying only to the cash
  price of leased items *(flyer)*.
- Maximum lease term **12–18 months**; payments weekly, biweekly, semimonthly
  or monthly, aligned to paydays (p.9).
- Three routes to ownership: **Maximum-Term Plan** (default), **100-Day
  Option** (lowest cost), **Early Buyout Option** (p.6–7).
- Both early options must be arranged by the customer at
  customer.snapfinance.com or **1-877-557-3769** — we cannot do it for them.
- **Right of surrender**: the customer may end the lease at any time by
  returning the goods to Snap in good condition (p.2, p.8).
- **Not available to residents of Minnesota, New Jersey or Wisconsin** (p.16).
- To apply: minimum legal age, **$750/month** income, active checking account
  (card may be needed), active email and smartphone number (p.10).
- Snap **does** pull credit reports — from Clarity Services and DataX, not the
  big three — and reports lease histories back to them (p.7–8). This is exactly
  why "no credit check" is banned: it would be untrue.

## Operational rules for the shop (not website copy)

- **No stacking** (p.10). A customer may not put part of a purchase on Snap and
  the rest on another finance option. Snap may charge back the merchandise and
  terminate the agreement. This constrains `invoice.html`: a Snap transaction
  must cover the whole invoice.
- **No used or refurbished merchandise** may be leased (p.11).
- **Snap does not lease services** (p.11). Installation or delivery *may* be
  permitted case by case — ask the CSM. This is why the Creek Ready setup card
  was removed from the page.
- **Applications must be completed electronically**, on the customer's device
  or in the Merchant Portal. Do not create or keep paper or electronic copies
  of application information (p.12).
- Staff may not finance **themselves, employees, or family members** (p.18).
- Escalate to merchant@snapfinance.com / 877-789-4384 if a complaint concerns
  Snap or the lease itself, if a customer retains an attorney, or if the BBB,
  an attorney general or the CFPB gets involved (p.12).
