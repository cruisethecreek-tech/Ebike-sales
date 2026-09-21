# Consolidating the two Apps Script projects

## Why

The site talks to two **separate Apps Script projects** — not two deployments
of one script, which is what `apps-script.gs`'s header note has said since it
was written:

| Deployment | Role | Pages |
|---|---|---|
| `…6xM0tEDAhcJA` | CMS menus, forms, invoices, orders, analytics | 37 |
| `…8Nd_gFLobsBE` | Bike inventory, colours, prices, bike orders | 10 |

Ten pages reference **both**. Nothing on a page says which URL it uses, and
nothing in either project says which deployment a given URL serves. That cost
a full debugging session: a fix was deployed to one project, the other kept
running old code, and every observation along the way was true of whichever
URL happened to be under the microscope.

Both projects read and write the **same spreadsheet** (`1R3pDFG_sO8…`), so
consolidating moves no data.

## Direction

Merge the inventory project **into** the CMS project (`…6xM0tEDAhcJA`), not
the other way round. That project already handles everything except bike
inventory — including all the invoice actions — so the code that has to move
is roughly 900 lines plus two handlers. The reverse direction would mean
moving 6,368.

## What blocks it

Three actions are sent by pages in this repo but have **no handler in this
repo**. Their source exists only inside the live projects:

| Action | Sent by | Why it matters |
|---|---|---|
| `processOrder` | 5 brand pages | The customer "Submit Order Request". **Sweeping the URLs before this is ported silently kills every bike order** — the brand pages call `showConfirmation()` in their `.catch`, so a failed order still shows the customer a confirmation. |
| `addBike` | salespro | Adds a sheet row. No evidence it was ever written; salespro's read-back will now say. |
| `sendBalanceLink` | balance.html | Stays on the CMS project either way. |

`apps-script-action-coverage.test.js` enforces this: any action sent without
a handler, and not listed in that file's `ONLY_IN_LIVE_PROJECT` map, fails.

## Steps, in order

1. **Export the missing handlers.** In the inventory project
   (`…8Nd_gFLobsBE`), copy the source of `processOrder` and `addBike` — and
   anything they call — into this repo so they are reviewable and never
   trapped in one project again.
2. **Paste into the CMS project.** Add `apps-script-inventory.snippet.gs` as
   its own file, plus the two handlers from step 1.
3. **Wire the dispatcher.** In that project's `doGet`, beside the existing
   `action ===` lines:
   ```js
   if (action === 'getBikeInventory')    return handleGetBikeInventory(e);
   if (action === 'getSidebarInventory') return handleGetSidebarInventory(e);
   if (action === 'setDiscontinued')     return handleSetDiscontinued(e);
   if (action === 'updatePrice')         return handleUpdatePrice(e);
   if (action === 'saveColors')          return handleSaveColors(e);
   if (action === 'saveSizeGuide')       return handleSaveSizeGuide(e);
   if (action === 'getStock')            return handleGetStock(e);
   if (action === 'inventoryVersion')    return handleInventoryVersion(e);
   if (action === 'processOrder')        return processOrder(e);
   if (action === 'addBike')             return addBike(e);
   ```
4. **Deploy once** — Deploy → Manage deployments → pencil → **New version**.
   Never "New deployment": that mints another URL and is how there came to be
   two in the first place.
5. **Verify before sweeping.** Open, on the CMS deployment:
   `…/exec?action=inventoryVersion` — expect `writesWillWork: true` and
   `handlersAreCurrent: true`.
6. **Sweep the URLs:**
   ```sh
   node tools/consolidate-apps-script-url.js --to <full CMS deployment id>
   node tools/consolidate-apps-script-url.js --to <full CMS deployment id> --apply
   node apps-script-action-coverage.test.js   # deployment count should read 1
   ```
7. **Smoke test the money paths** before calling it done: a bike order from a
   brand page, a colour save from salespro, an invoice from invoice.html.
   Confirm each landed **in the sheet**, not just that the UI said so.
8. **Retire the old deployment** only after that, by disabling it — not
   deleting it — so anything still pointing at it fails loudly rather than
   quietly.

## Unrelated bug found while mapping this

The five brand pages show the customer an order confirmation from inside
their `.catch`:

```js
.catch(function(e) {
  // Even on network error, order likely went through — show confirmation
  showConfirmation();
});
```

A bike order that never reached the sheet still tells the customer it did.
That is the same silent-failure pattern as the colour saves, on the one path
where it costs a sale. Worth fixing on its own, independently of this work.
