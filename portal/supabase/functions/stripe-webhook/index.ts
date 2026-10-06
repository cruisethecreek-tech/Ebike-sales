// Stripe → Supabase webhook for CreekGuard plans (Supabase Edge Function, Deno).
//
// CreekGuard is sold through Stripe Payment Links, which tell the portal
// nothing on their own. Stripe POSTs subscription events here; this function
// keeps public.creekguard_subscriptions (migration 00022) up to date and
// pushes staff phones through ntfy (the same NTFY_TOPIC as traccar-ingest)
// when someone signs up, cancels, stops paying, or their plan ends.
//
// It never switches a tracker off. Admin > Fleet GPS lists cancelled plans
// with the customer's tracker until staff retire it and mark it off.
//
// Auth is Stripe's signature, not a Supabase JWT: deploy with
// --no-verify-jwt and set STRIPE_WEBHOOK_SECRET to the endpoint's signing
// secret. Unsigned or badly signed requests get 400 and change nothing.

import { createClient } from "npm:@supabase/supabase-js@2";
import { interpretEvent, noticeText, verifySignature } from "./stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Portal customer for a checkout email, so Fleet GPS can show their tracker.
// listUsers pages at most 1000; see portal/lib/find-auth-user.ts for why the
// loop matters.
async function customerIdForEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error(`user lookup failed: ${error.message}`);
      return null;
    }
    const users = data?.users ?? [];
    const hit = users.find((u) => String(u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 1000) return null;
  }
  return null;
}

async function push(title: string, message: string, urgent: boolean): Promise<void> {
  const topic = Deno.env.get("NTFY_TOPIC");
  if (!topic) return;
  try {
    await fetch(Deno.env.get("NTFY_SERVER") ?? "https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        title,
        message,
        priority: urgent ? 4 : 3,
        tags: ["shield"],
        click: "https://portal.cruisethecreek.com/admin/fleet#creekguard",
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.error(`push failed: ${err}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const body = await req.text();
  const ok = await verifySignature(
    Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
    req.headers.get("stripe-signature"),
    body,
  );
  if (!ok) return new Response("bad signature", { status: 400 });

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const change = interpretEvent(event);
  if (!change) return new Response("ignored", { status: 200 });

  // Seen this event before (a Stripe retry)? Then it was handled.
  const { data: fresh, error: seenError } = await supabase
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (seenError) return new Response(seenError.message, { status: 500 });
  if (!fresh || fresh.length === 0) return new Response("duplicate", { status: 200 });

  const { data: existing } = await supabase
    .from("creekguard_subscriptions")
    .select("email, name, customer_id")
    .eq("stripe_subscription_id", change.subscriptionId)
    .maybeSingle();

  const row: Record<string, unknown> = { stripe_subscription_id: change.subscriptionId, ...change.row };
  // Subscription events carry no email; keep what checkout recorded.
  if (!row.email) delete row.email;
  if (!row.name) delete row.name;
  if (row.stripe_customer_id == null) delete row.stripe_customer_id;
  // A new cancellation, failed payment or ended plan puts the row back on the
  // Fleet GPS list even if staff dismissed an earlier one for it.
  if (change.notice && ["canceling", "past_due", "ended"].includes(change.notice.kind)) {
    row.tracker_off_at = null;
  }
  if (!existing?.customer_id && row.email) {
    row.customer_id = await customerIdForEmail(String(row.email));
  }

  const { error } = await supabase
    .from("creekguard_subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) {
    // Let Stripe retry: forget the event so the retry is not a "duplicate".
    await supabase.from("stripe_events").delete().eq("id", event.id);
    return new Response(error.message, { status: 500 });
  }

  if (change.notice) {
    const who = (row.name as string) || existing?.name || (row.email as string) || existing?.email ||
      `Stripe customer ${row.stripe_customer_id ?? "unknown"}`;
    const text = noticeText(change.notice.kind, who, change.notice.when);
    await push(text.title, text.message, text.urgent);
  }

  return new Response("ok", { status: 200 });
});
