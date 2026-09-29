import { STORE_URL } from '@/lib/constants'
import { resolveSwatchHex } from '@/lib/swatch-colors'

/**
 * The shop's bike catalogue, as the storefront pages read it: every model's
 * colours, each with a name and a product photo. The portal uses it so staff
 * can say which colour a customer's bike is, and the customer then sees that
 * photo on My Bikes instead of just the model name.
 *
 * data/inventory.json is regenerated from the Google Sheet every day and
 * served by the storefront, so it is fetched from there rather than copied.
 */

export type CatalogColor = { name: string; hex: string | null; img: string }
export type CatalogModel = { key: string; brand: string; name: string; colors: CatalogColor[] }

const INVENTORY_URL = `${STORE_URL.replace(/\/$/, '')}/data/inventory.json`

/** Colours are nested by style and size on some bikes and flat on others. */
function collectColors(node: unknown, out: CatalogColor[]) {
  if (Array.isArray(node)) {
    for (const s of node) {
      if (!s || typeof s !== 'object') continue
      const sw = s as { name?: unknown; hex?: unknown; img?: unknown }
      const name = String(sw.name ?? '').trim()
      const img = httpsImage(sw.img)
      if (!name || out.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue
      out.push({ name, hex: resolveSwatchHex(name, String(sw.hex ?? '')), img })
    }
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectColors(v, out)
  }
}

/** Some feed photos are http://; the portal is https and would block them. */
export function httpsImage(url: unknown): string {
  const u = String(url ?? '').trim()
  if (/^https:\/\//i.test(u)) return u
  if (/^http:\/\//i.test(u)) return 'https://' + u.slice(7)
  return ''
}

export function parseCatalog(inventory: unknown): CatalogModel[] {
  const bikes = Array.isArray(inventory)
    ? inventory
    : ((inventory as { bikes?: unknown[] })?.bikes ?? [])
  const models: CatalogModel[] = []
  for (const b of bikes as Record<string, unknown>[]) {
    const brand = String(b?.brand ?? '').trim()
    const name = String(b?.name ?? '').trim()
    if (!brand || !name) continue
    const colors: CatalogColor[] = []
    collectColors(b.colors, colors)
    models.push({ key: `${brand}|${String(b.id ?? name)}`, brand, name, colors })
  }
  return models
}

export async function loadCatalog(): Promise<CatalogModel[]> {
  try {
    const res = await fetch(INVENTORY_URL, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    return parseCatalog(await res.json())
  } catch {
    return []
  }
}

/** "Tk2 Pro Blue Haze" and "TK2Pro" compare as the same model. */
function modelKey(s: string): string {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(e-?bike|electric|e-?trike|trike|bike)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * The catalogue model a registered bike most likely is. Bike models are typed
 * by hand on invoices ("Tk2 Pro Blue Haze", "TK2 Electric Trike (Blue)"), so
 * this takes the longest catalogue name the typed one starts with, within the
 * same brand. Null when nothing fits; staff then pick the model themselves.
 */
export function matchCatalogModel(models: CatalogModel[], brand: string, model: string): CatalogModel | null {
  const typed = modelKey(model)
  const brandLc = brand.toLowerCase()
  let best: CatalogModel | null = null
  let bestLen = 0
  for (const m of models) {
    if (m.brand.toLowerCase() !== brandLc) continue
    const k = modelKey(m.name)
    if (k.length >= 2 && typed.startsWith(k) && k.length > bestLen) {
      best = m
      bestLen = k.length
    }
  }
  return best
}

/**
 * A colour the typed model already names, to preselect: "Venus Pink" is Pink,
 * "Hybrid Black" is Onyx Black (the only colour ending in "black"). Only a
 * suggestion; staff confirm it.
 */
export function colorNamedIn(model: string, colors: CatalogColor[]): CatalogColor | null {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const text = ' ' + words(model) + ' '
  let best: CatalogColor | null = null
  for (const c of colors) {
    const n = words(c.name)
    if (n && text.includes(' ' + n + ' ') && (!best || n.length > words(best.name).length)) best = c
  }
  if (best) return best
  const byLastWord = colors.filter((c) => {
    const last = words(c.name).split(' ').pop() || ''
    return last.length >= 3 && text.includes(' ' + last + ' ')
  })
  return byLastWord.length === 1 ? byLastWord[0] : null
}
