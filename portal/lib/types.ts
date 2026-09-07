// ────────────────────────────────────────────────────────────
// TypeScript types mirroring the Supabase schema
// (portal/supabase/migrations/00001 + 00002)
// ────────────────────────────────────────────────────────────

export type ContactMethod = "text" | "email" | "phone";

export type BikeBrand =
  | "Heybike"
  | "Velotric"
  | "Jasion"
  | "Mooncool"
  | "other";

export type InvoiceStatus = "paid" | "pending";

export type TicketType =
  | "tune-up"
  | "warranty"
  | "general question"
  | "upgrade request";

export type TicketStatus = "open" | "in progress" | "resolved";

// ── Row types ────────────────────────────────────────────────

export interface Customer {
  id: string; // uuid — matches auth.users.id
  first_name: string;
  last_name: string;
  phone: string | null;
  preferred_contact: ContactMethod;
  referral_code: string | null;
  referred_by: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Bike {
  id: string;
  customer_id: string;
  brand: BikeBrand;
  model: string;
  serial_number: string | null;
  receipt_number?: string | null;
  purchase_date: string | null; // ISO date
  warranty_expires_at: string | null; // ISO date
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  invoice_number: string | null;
  total_amount: number;
  pdf_url: string | null;
  status: InvoiceStatus;
  issued_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceTicket {
  id: string;
  customer_id: string;
  bike_id: string | null;
  ticket_type: TicketType;
  status: TicketStatus;
  description: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Joined fields (optional, populated via query)
  bikes?: Pick<Bike, "brand" | "model"> | null;
}

// ── Phase 2: Leaderboard & Photos ────────────────────────────

export interface RideLog {
  id: string;
  customer_id: string;
  miles: number;
  ride_date: string; // ISO date
  notes: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  customer_id: string;
  first_name: string;
  last_name: string;
  total_miles: number;
  total_rides: number;
  last_ride: string | null;
}

export interface CommunityPhoto {
  id: string;
  customer_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  // Joined
  customers?: Pick<Customer, "first_name" | "last_name"> | null;
}

export interface ReferralCredit {
  id: string;
  customer_id: string;
  amount: number;
  reason: string;
  redeemed: boolean;
  redeemed_at: string | null;
  redeemed_note: string | null;
  created_at: string;
}
