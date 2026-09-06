import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ibvbusjmqbacsqinknfh.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidmJ1c2ptcWJhY3NxaW5rbmZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzI4NzA4MCwiZXhwIjoyMDk4ODYzMDgwfQ.Jkli9RxtsdfUPqx_GFeFBNoGtn3IQx9touIDYtnd-mU";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SHEET_ID = "1R3pDFG_sO81bKS6dEAa-k5F-OdD5OAbe4hQ-Oc0_T-E";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
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

type BikeBrand = "Heybike" | "Velotric" | "Jasion" | "Mooncool" | "other";

function detectBrandAndModel(itemDesc: string): { brand: BikeBrand; model: string } | null {
  const d = itemDesc.trim();
  const lower = d.toLowerCase();

  // Exclude non-bike accessories & services
  if (
    lower.includes("installation") ||
    lower.includes("tune-up") ||
    lower.includes("tune up") ||
    lower.includes("service") ||
    lower.includes("assembly") ||
    lower.includes("delivery") ||
    lower.includes("accessory") ||
    lower.includes("mirror") ||
    lower.includes("helmet") ||
    lower.includes("lock") ||
    lower.includes("basket") ||
    lower.includes("bag") ||
    lower.includes("battery") ||
    lower.includes("throttle") ||
    lower.includes("tire") ||
    lower.includes("tube") ||
    lower.includes("pad") ||
    lower.includes("pedal") ||
    lower.includes("freight") ||
    lower.includes("shipping")
  ) {
    return null;
  }

  let brand: BikeBrand = "other";
  if (lower.includes("heybike")) brand = "Heybike";
  else if (lower.includes("velotric")) brand = "Velotric";
  else if (lower.includes("jasion")) brand = "Jasion";
  else if (lower.includes("mooncool")) brand = "Mooncool";

  let model = d;
  if (brand !== "other") {
    model = d.replace(new RegExp(brand, "i"), "").trim();
  }
  if (!model) model = d;

  return { brand, model: model.replace(/^[-–—:\s]+/, "").trim() };
}

async function sync() {
  const csvUrl =
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?tqx=out:csv&sheet=Invoices";
  const resp = await fetch(csvUrl);
  const csvText = await resp.text();
  const rows = parseCSV(csvText);
  console.log("Parsed", rows.length, "invoices from Google Sheet");

  const { data: usersData } = await supabase.auth.admin.listUsers();
  const emailToId = new Map<string, string>();
  usersData?.users?.forEach((u) => {
    if (u.email) emailToId.set(u.email.toLowerCase().trim(), u.id);
  });

  let bikesAdded = 0;
  let invoicesUpdated = 0;

  for (const row of rows) {
    const email = row.customerEmail?.toLowerCase().trim();
    const invNum = row.invoiceNumber?.trim();
    const userId = email ? emailToId.get(email) : null;

    // 1. Update invoice date / issued_at
    if (invNum && row.invoiceDate) {
      const issuedAt = new Date(row.invoiceDate).toISOString();
      const isPaid = row.status?.toLowerCase().includes("paid");
      await supabase
        .from("invoices")
        .update({
          issued_at: issuedAt,
          paid_at: isPaid
            ? row.createdAt
              ? new Date(row.createdAt).toISOString()
              : issuedAt
            : null,
        })
        .eq("invoice_number", invNum);
      invoicesUpdated++;
    }

    // 2. Parse lineItems for bikes
    if (userId && row.lineItems) {
      try {
        let items: any[] = [];
        try {
          items = JSON.parse(row.lineItems);
        } catch {
          // Ignore parse errors
        }
        if (Array.isArray(items)) {
          for (const item of items) {
            const desc = item.description || item.name || "";
            const bikeInfo = detectBrandAndModel(desc);
            if (bikeInfo && bikeInfo.model) {
              const { data: existingBike } = await supabase
                .from("bikes")
                .select("id")
                .eq("customer_id", userId)
                .eq("model", bikeInfo.model)
                .maybeSingle();

              if (!existingBike) {
                const purchaseDate = row.invoiceDate
                  ? row.invoiceDate.split("T")[0]
                  : null;
                const { error: bErr } = await supabase.from("bikes").insert({
                  customer_id: userId,
                  brand: bikeInfo.brand,
                  model: bikeInfo.model,
                  purchase_date: purchaseDate,
                });
                if (!bErr) {
                  console.log(
                    `Added bike: ${bikeInfo.brand} ${bikeInfo.model} for ${email}`
                  );
                  bikesAdded++;
                } else {
                  console.log(`Bike insert err: ${bErr.message}`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.log(`Error parsing lineItems for ${invNum}`, err);
      }
    }
  }

  console.log(
    `Sync complete! Updated invoices: ${invoicesUpdated} | Added bikes: ${bikesAdded}`
  );
}

sync();
