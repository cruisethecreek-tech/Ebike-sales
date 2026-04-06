// ============================================================
// Google Apps Script — Discontinued Bike Support
// ============================================================
//
// SETUP INSTRUCTIONS:
//
// 1. Open your Google Sheet that holds the bike inventory.
//
// 2. Add a "Discontinued" column:
//    - Find the last column with data in your inventory sheet
//    - In the next empty column header (Row 1), type: Discontinued
//    - Leave cells blank for active bikes
//    - The script will write "Yes" for discontinued bikes
//
// 3. Open your Apps Script project:
//    - In the Google Sheet, go to Extensions > Apps Script
//    - Find your existing doGet(e) function
//
// 4. Find the column number:
//    - Count which column "Discontinued" is (A=1, B=2, etc.)
//    - Update DISCONTINUED_COL below with that number
//
// 5. Add the code snippets below to your existing Apps Script.
//
// 6. Redeploy:
//    - Click Deploy > Manage deployments
//    - Edit the existing deployment
//    - Set version to "New version"
//    - Click Deploy
//
// ============================================================

// --- ADD THIS near the top of your script, with your other column constants ---

var DISCONTINUED_COL = 14; // <-- Change this to match your "Discontinued" column number


// --- ADD THIS inside your doGet(e) function, alongside the other action handlers ---
// Look for where you handle action === 'updatePrice', 'saveColors', etc.
// Add this block in the same if/else chain:

/*
  // ── Set Discontinued status ────────────────────────────
  if (action === 'setDiscontinued') {
    var rowIndex = parseInt(e.parameter.rowIndex);
    var discontinued = e.parameter.discontinued || '';
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inventory');
    // YOUR_SHEET_NAME ^^^ — replace 'Inventory' with your actual sheet name

    if (!rowIndex || rowIndex < 2) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error', message: 'Invalid rowIndex'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    sheet.getRange(rowIndex, DISCONTINUED_COL).setValue(discontinued);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok', message: 'Discontinued set to: ' + (discontinued || '(cleared)')
    })).setMimeType(ContentService.MimeType.JSON);
  }
*/


// --- MODIFY your getBikeInventory handler to include the discontinued field ---
// Find where you build each bike object in your getBikeInventory action.
// Add the discontinued field to each bike object. Example:

/*
  // Inside your getBikeInventory loop where you build bike objects:
  var bike = {
    // ... your existing fields (brand, id, name, price, etc.) ...
    discontinued: row[DISCONTINUED_COL - 1] || ''   // <-- ADD THIS LINE
  };
*/


// --- SIMILARLY, modify getSidebarInventory to include it ---

/*
  // Inside your getSidebarInventory loop:
  var bike = {
    // ... your existing fields ...
    discontinued: row[DISCONTINUED_COL - 1] || ''   // <-- ADD THIS LINE
  };
*/


// ============================================================
// FULL EXAMPLE — if your doGet looks something like this:
// ============================================================

/*
function doGet(e) {
  var action = e.parameter.action;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inventory');

  // ... existing handlers ...

  if (action === 'updatePrice') {
    // ... existing code ...
  }

  // ADD THIS BLOCK ↓↓↓
  if (action === 'setDiscontinued') {
    var rowIndex = parseInt(e.parameter.rowIndex);
    var discontinued = e.parameter.discontinued || '';

    if (!rowIndex || rowIndex < 2) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error', message: 'Invalid rowIndex'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    sheet.getRange(rowIndex, DISCONTINUED_COL).setValue(discontinued);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok', message: 'Discontinued set to: ' + (discontinued || '(cleared)')
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ... rest of existing handlers ...
}
*/


// ============================================================
// VERIFICATION
// ============================================================
//
// After deploying, test with this URL in your browser:
//   YOUR_APPS_SCRIPT_URL?action=setDiscontinued&rowIndex=3&discontinued=Yes
//
// You should see: {"status":"ok","message":"Discontinued set to: Yes"}
// And the Discontinued column in row 3 of your sheet should now say "Yes"
//
// Then in the Sales Pro admin panel, mark a bike as discontinued
// and save — it should sync to the sheet automatically.
//
// The brand pages (heybike.html, velotric.html, jasion.html) will
// then filter out any bike where discontinued === "Yes" from the
// API response, hiding them on all devices.
// ============================================================
