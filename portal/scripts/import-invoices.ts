/**
 * import-invoices.ts
 *
 * One-time script to import existing invoices from the Cruise the Creek
 * Google Sheet into the Supabase customer portal.
 *
 * For each invoice row it:
 *   1. Creates a Supabase Auth user (if the email doesn't already exist)
 *   2. Creates a `customers` row (first_name, last_name, phone)
 *   3. Creates an `invoices` row linked to that customer
 *
 * Uses the service_role key to bypass RLS.
 *
 * Usage:
 *   npx tsx scripts/import-invoices.ts              # dry-run (default)
 *   npx tsx scripts/import-invoices.ts --commit     # actually write to Supabase
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ───────────────────────────────────────────────────
const SUPABASE_URL = "https://ibvbusjmqbacsqinknfh.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidmJ1c2ptcWJhY3NxaW5rbmZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzI4NzA4MCwiZXhwIjoyMDk4ODYzMDgwfQ.Jkli9RxtsdfUPqx_GFeFBNoGtn3IQx9touIDYtnd-mU";

const SHEET_ID = "1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E";
const SHEET_TAB = "Invoices";

// ── Supabase admin client (bypasses RLS) ─────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── CSV parser (simple — handles our known format) ───────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse a CSV line respecting quoted fields
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });
}

// ── Parse currency strings like "$1,999.00" → 1999.00 ───────
function parseCurrency(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$,]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── Split "FirstName LastName" into parts ────────────────────
function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "(none)" };
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return { first, last: last || "(none)" };
}

// ── Map Sheet status → Supabase invoice_status enum ──────────
function mapStatus(sheetStatus: string): "paid" | "pending" {
  const s = sheetStatus.toLowerCase().trim();
  if (s === "paid" || s === "paidinfullcash") return "paid";
  return "pending"; // sent, open, etc. → pending
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const isDryRun = !process.argv.includes("--commit");

  if (isDryRun) {
    console.log("🔍 DRY RUN — no data will be written. Pass --commit to import.\n");
  } else {
    console.log("🚀 COMMIT MODE — writing to Supabase!\n");
  }

  // 1. Fetch invoice CSV from Google Sheets
  console.log("📊 Fetching invoices from Google Sheets...");
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`Sheet fetch failed: ${resp.status} ${resp.statusText}`);
  const csvText = await resp.text();
  const rows = parseCSV(csvText);
  console.log(`   Found ${rows.length} invoice rows\n`);

  if (rows.length === 0) {
    console.log("No invoices to import.");
    return;
  }

  // 2. Group by unique email → customer
  const customerMap = new Map<
    string,
    { name: string; phone: string; email: string; invoices: typeof rows }
  >();

  for (const row of rows) {
    const email = row.customerEmail?.toLowerCase().trim();
    if (!email) {
      console.log(`   ⚠️  Skipping ${row.invoiceNumber} — no email`);
      continue;
    }

    if (!customerMap.has(email)) {
      customerMap.set(email, {
        name: row.customerName || "",
        phone: row.customerPhone || "",
        email,
        invoices: [],
      });
    }
    customerMap.get(email)!.invoices.push(row);
  }

  console.log(`👤 ${customerMap.size} unique customers found\n`);

  // 3. Process each customer
  let customersCreated = 0;
  let customersSkipped = 0;
  let invoicesCreated = 0;
  let invoicesSkipped = 0;
  let errors = 0;

  for (const [email, customer] of customerMap) {
    const { first, last } = splitName(customer.name);
    console.log(`── ${customer.name} (${email}) — ${customer.invoices.length} invoice(s)`);

    if (isDryRun) {
      console.log(`   Would create auth user: ${email}`);
      console.log(`   Would create customer: ${first} ${last}, phone: ${customer.phone}`);
      for (const inv of customer.invoices) {
        const total = parseCurrency(inv.total);
        const status = mapStatus(inv.status);
        console.log(`   Would create invoice: ${inv.invoiceNumber} — $${total.toFixed(2)} (${status})`);
      }
      customersCreated++;
      invoicesCreated += customer.invoices.length;
      continue;
    }

    // ── Create or find the auth user ──
    let userId: string | null = null;

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );

    if (existingUser) {
      userId = existingUser.id;
      console.log(`   ✓ Auth user exists: ${userId}`);
      customersSkipped++;
    } else {
      // Create new auth user with random password (they'll use magic link to sign in)
      const randomPwd =
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2) +
        "Aa1!";

      const { data: newUser, error: authErr } =
        await supabase.auth.admin.createUser({
          email,
          password: randomPwd,
          email_confirm: true, // auto-confirm so they can sign in immediately
          user_metadata: { first_name: first, last_name: last },
        });

      if (authErr) {
        console.log(`   ❌ Auth error: ${authErr.message}`);
        errors++;
        continue;
      }
      userId = newUser.user.id;
      console.log(`   ✓ Created auth user: ${userId}`);
      customersCreated++;
    }

    // ── Create customer profile (upsert) ──
    const { error: custErr } = await supabase.from("customers").upsert(
      {
        id: userId,
        first_name: first,
        last_name: last,
        phone: customer.phone || null,
      },
      { onConflict: "id" }
    );

    if (custErr) {
      console.log(`   ❌ Customer upsert error: ${custErr.message}`);
      errors++;
      continue;
    }
    console.log(`   ✓ Customer profile OK`);

    // ── Create invoices ──
    for (const inv of customer.invoices) {
      const invoiceNumber = inv.invoiceNumber?.trim();
      if (!invoiceNumber) continue;

      // Check if invoice already exists
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("invoice_number", invoiceNumber)
        .single();

      if (existing) {
        console.log(`   ⏭️  Invoice ${invoiceNumber} already exists — skipping`);
        invoicesSkipped++;
        continue;
      }

      const total = parseCurrency(inv.total);
      const status = mapStatus(inv.status);
      const issuedAt = inv.invoiceDate
        ? new Date(inv.invoiceDate).toISOString()
        : inv.createdAt || new Date().toISOString();

      const { error: invErr } = await supabase.from("invoices").insert({
        customer_id: userId,
        invoice_number: invoiceNumber,
        total_amount: total,
        status,
        issued_at: issuedAt,
        paid_at: status === "paid" ? issuedAt : null,
        pdf_url: inv.paymentLink || null,
      });

      if (invErr) {
        console.log(`   ❌ Invoice ${invoiceNumber} error: ${invErr.message}`);
        errors++;
      } else {
        console.log(`   ✓ Invoice ${invoiceNumber} — $${total.toFixed(2)} (${status})`);
        invoicesCreated++;
      }
    }

    console.log("");
  }

  // 4. Summary
  console.log("═══════════════════════════════════════");
  console.log(isDryRun ? "DRY RUN SUMMARY" : "IMPORT COMPLETE");
  console.log("═══════════════════════════════════════");
  console.log(`Customers created:  ${customersCreated}`);
  console.log(`Customers skipped:  ${customersSkipped}`);
  console.log(`Invoices created:   ${invoicesCreated}`);
  console.log(`Invoices skipped:   ${invoicesSkipped}`);
  console.log(`Errors:             ${errors}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
