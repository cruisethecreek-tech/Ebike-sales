// Pure helpers for the stripe-webhook function, kept free of Deno and
// Supabase imports so node:test can run them (stripe.test.mjs).

// Stripe signs each delivery: the Stripe-Signature header carries
// t=<unix seconds> and one or more v1=<hex HMAC-SHA256 of "t.body">, keyed
// with the endpoint's signing secret (whsec_...). Deliveries older than
// TOLERANCE_S are refused so a captured request cannot be replayed later.
export const TOLERANCE_S = 300;

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
}

export async function verifySignature(
  secret: string,
  header: string | null,
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !header) return false;
  let t = NaN;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s.trim());
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!Number.isFinite(t) || sigs.length === 0) return false;
  if (Math.abs(nowS - t) > TOLERANCE_S) return false;
  const expected = await signPayload(secret, t, body);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

const toIso = (s: unknown): string | null =>
  typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null;

// What one Stripe event means for creekguard_subscriptions, and whether staff
// should get a push. null = an event (or a checkout) that is not CreekGuard's.
export type Change = {
  subscriptionId: string;
  row: Record<string, unknown>;
  notice: null | { kind: "signup" | "canceling" | "resumed" | "past_due" | "ended"; when?: string | null };
};

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, any>; previous_attributes?: Record<string, any> };
};

// Stripe statuses that mean the customer is not paying.
const PAYMENT_TROUBLE = new Set(["past_due", "unpaid"]);

export function interpretEvent(event: StripeEvent): Change | null {
  const obj = event.data?.object ?? {};
  const prev = event.data?.previous_attributes ?? {};

  if (event.type === "checkout.session.completed") {
    // CreekGuard is the shop's only subscription product. A one-off payment
    // through some other link is mode "payment" and is left alone.
    if (obj.mode !== "subscription" || typeof obj.subscription !== "string") return null;
    const details = obj.customer_details ?? {};
    return {
      subscriptionId: obj.subscription,
      row: {
        stripe_customer_id: typeof obj.customer === "string" ? obj.customer : null,
        email: details.email ? String(details.email).trim().toLowerCase() : null,
        name: details.name ? String(details.name).trim() : null,
        status: "active",
      },
      notice: { kind: "signup" },
    };
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    if (typeof obj.id !== "string") return null;
    const base = { stripe_customer_id: typeof obj.customer === "string" ? obj.customer : null };

    if (event.type === "customer.subscription.deleted") {
      const ended = toIso(obj.ended_at) ?? toIso(obj.canceled_at) ?? new Date().toISOString();
      return {
        subscriptionId: obj.id,
        row: { ...base, status: "canceled", ended_at: ended },
        notice: { kind: "ended", when: ended },
      };
    }

    // Cancelling in Stripe usually means "at the end of the period": the plan
    // stays active and cancel_at is set. Either flag can carry it.
    const cancelAt = toIso(obj.cancel_at) ??
      (obj.cancel_at_period_end ? toIso(obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end) : null);
    const status = cancelAt && obj.status !== "canceled" ? "canceling" : String(obj.status ?? "active");
    const row = { ...base, status, cancel_at: cancelAt };

    const wasCanceling = "cancel_at_period_end" in prev || "cancel_at" in prev
      ? Boolean(prev.cancel_at_period_end) || Boolean(prev.cancel_at)
      : Boolean(cancelAt);
    let notice: Change["notice"] = null;
    if (cancelAt && !wasCanceling) notice = { kind: "canceling", when: cancelAt };
    else if (!cancelAt && wasCanceling) notice = { kind: "resumed" };
    else if ("status" in prev && PAYMENT_TROUBLE.has(String(obj.status)) && !PAYMENT_TROUBLE.has(String(prev.status))) {
      notice = { kind: "past_due" };
    }
    return { subscriptionId: obj.id, row, notice };
  }

  return null;
}

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })
    : "";

export function noticeText(kind: NonNullable<Change["notice"]>["kind"], who: string, when?: string | null) {
  switch (kind) {
    case "signup":
      return { title: `CreekGuard sign-up: ${who}`, message: "New plan started. Book the install.", urgent: false };
    case "canceling":
      return {
        title: `CreekGuard cancelled: ${who}`,
        message: `Plan ends ${fmtDate(when)}. Retire the tracker and deactivate the SIM after that date.`,
        urgent: false,
      };
    case "resumed":
      return { title: `CreekGuard kept: ${who}`, message: "The cancellation was undone. Nothing to switch off.", urgent: false };
    case "past_due":
      return { title: `CreekGuard payment failing: ${who}`, message: "Stripe could not charge the card. It will retry.", urgent: false };
    case "ended":
      return {
        title: `CreekGuard ended: ${who}`,
        message: "Plan is over. Retire the tracker on Fleet GPS and deactivate the SIM in 1NCE.",
        urgent: true,
      };
  }
}
