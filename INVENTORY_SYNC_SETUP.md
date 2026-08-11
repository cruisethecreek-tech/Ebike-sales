# Inventory Auto-Sync Setup

This document explains how the bike inventory sync works and how to configure it.

## How It Works

```
Pat edits Google Sheet (price, new bike, discontinue a model)
        ↓
Apps Script onEdit trigger fires
        ↓
Apps Script calls GitHub API: triggers "sync-inventory" workflow
        ↓
GitHub Action fetches ?action=getBikeInventory from Apps Script
        ↓
Commits updated data/inventory.json to the repo
        ↓
Cloudflare Pages auto-deploys (~30 seconds later)
```

Pat edits the Sheet — the live site updates automatically within ~1 minute.

---

## One-Time Setup (10 minutes)

### Step 1 — Create a GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a name: `CTC Inventory Sync`
4. Set expiration: **No expiration** (or 1 year)
5. Check the `repo` scope only
6. Click **Generate token**
7. **Copy the token** — you only see it once

### Step 2 — Add the token to Apps Script

1. Open the Google Apps Script inventory project
   (the one at `AKfycbyxVMuF...` — the one that owns `getBikeInventory`)
2. Click **Project Settings** (gear icon) → **Script Properties**
3. Click **Add script property**:
   - Property name: `GITHUB_PAT`
   - Value: paste your token from Step 1
4. Click **Save script properties**

### Step 3 — Add the onEdit trigger function

Paste this function into the Apps Script inventory project, then deploy a new version:

```javascript
/**
 * Fires when Pat edits the Direct_Inventory sheet tab.
 * Triggers the GitHub Action that updates data/inventory.json in the repo.
 * Requires GITHUB_PAT in Script Properties (see INVENTORY_SYNC_SETUP.md).
 */
function onInventoryEdit(e) {
  // Only trigger on Direct_Inventory tab to avoid firing on every sheet edit.
  var sheet = e && e.range && e.range.getSheet();
  if (!sheet) return;
  var tabName = sheet.getName();
  if (tabName !== 'Direct_Inventory') return;

  var pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!pat) { console.warn('GITHUB_PAT not set — inventory sync skipped'); return; }

  var payload = JSON.stringify({
    event_type: 'sync-inventory',
    client_payload: {
      triggered_by: 'apps-script-on-edit',
      tab: tabName,
      timestamp: new Date().toISOString()
    }
  });

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'token ' + pat,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CTC-Apps-Script'
    },
    payload: payload,
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(
    'https://api.github.com/repos/cruisethecreek-tech/Ebike-sales/dispatches',
    options
  );

  console.log('GitHub sync triggered. Status:', response.getResponseCode());
}
```

### Step 4 — Register the trigger

In the Apps Script editor:
1. Click the **clock icon** (Triggers) in the left sidebar
2. Click **+ Add Trigger**
3. Configure:
   - Function: `onInventoryEdit`
   - Event source: **From spreadsheet**
   - Event type: **On edit**
4. Click **Save** (authorize if prompted)

### Step 5 — Test it

1. Go to **GitHub → Actions → Sync Bike Inventory** and click **Run workflow** manually
2. Confirm it completes and the `data/inventory.json` timestamp updates

---

## Fallback / Manual Sync

If you ever need to force a sync without editing the Sheet:
- Go to [GitHub Actions](https://github.com/cruisethecreek-tech/Ebike-sales/actions/workflows/sync-inventory.yml)
- Click **Run workflow** → **Run workflow**

The action also runs automatically every day at 6 AM UTC as a safety net.

---

## What the JSON Looks Like

```json
{
  "lastUpdated": "2026-08-11T16:00:00Z",
  "bikes": [
    {
      "brand": "Heybike",
      "id": "rangers",
      "name": "Ranger S",
      "price": 1199,
      "discontinued": false,
      "colors": { ... }
    }
  ]
}
```

The `lastUpdated` field is a UTC timestamp showing when the file was last synced.
