import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Personal touches for the portal invite and sign-in emails.
 *
 * Supabase renders those emails from templates (Authentication > Email
 * Templates), and a template can read the account's user_metadata as
 * {{ .Data.first_name }} and {{ .Data.purchase }}. So before an email goes
 * out, the customer's first name and what they bought are written there.
 */

type BikeLike = { brand?: string | null; model?: string | null; count?: number }

/** "Heybike Ranger S", "Heybike Ranger S and Velotric Fold 1", "2 Heybike Ranger S". */
export function purchaseSummary(bikes: BikeLike[]): string {
  const names: string[] = []
  for (const b of bikes || []) {
    const brand = String(b.brand || '').trim()
    const model = String(b.model || '').trim()
    if (!model) continue
    // 'other' is the enum's catch-all, not a brand anyone would recognise.
    const name = brand && brand.toLowerCase() !== 'other' && !model.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${model}`
      : model
    const count = Math.max(1, Math.floor(Number(b.count) || 1))
    names.push(count > 1 ? `${count} ${name}` : name)
  }
  // The same bike listed twice (two rows for one model) reads as one entry.
  const unique = [...new Set(names)]
  if (unique.length === 0) return ''
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`
}

/** What a customer bought, from the bikes on their account; '' if none. */
export async function loadPurchaseSummary(supabase: SupabaseClient, customerId: string): Promise<string> {
  const { data, error } = await supabase
    .from('bikes')
    .select('brand, model')
    .eq('customer_id', customerId)
    .order('purchase_date', { ascending: false, nullsFirst: false })
  if (error) {
    console.error('purchase summary lookup failed:', error.message)
    return ''
  }
  return purchaseSummary(data ?? [])
}
