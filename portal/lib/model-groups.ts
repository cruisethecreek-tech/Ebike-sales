import type { CatalogModel } from './bike-catalog'

/**
 * The base model a sold bike belongs to, for grouping sales by model. Bike
 * models are typed by hand on invoices, so the same model arrives as
 * "Tempo high-step silver", "Tempo Large HS Silver" and "Tempo (Reg/HS/Green)".
 * All of those are "Tempo".
 *
 * The shop catalogue is tried first (longest catalogue name the typed model
 * starts with, same brand). Models the catalogue no longer lists ("Ranger S",
 * "Mars 2.0") fall back to cutting the name at its first colour, size or
 * frame word.
 */

// Words that describe a variant rather than the model.
const VARIANT_WORDS = new Set([
  // colours
  'black', 'white', 'silver', 'grey', 'gray', 'blue', 'red', 'green', 'pink', 'purple',
  'mint', 'gold', 'smoke', 'yellow', 'orange', 'camo', 'teal', 'navy', 'magenta', 'haze',
  'lemon', 'lemons', 'ocean', 'slate', 'deep', 'light', 'dark', 'beige', 'brown', 'cream',
  'sand', 'olive', 'onyx', 'charcoal', 'matte', 'glossy',
  // sizes and frames
  'regular', 'reg', 'large', 'small', 'medium', 'high-step', 'highstep', 'hs', 'step-through',
  'low-step', 'lowstep',
  // invoice notes
  'shipped', 'free', 'install', 'rack',
])

// Words the shop adds to its own fleet bikes, not part of the model.
const PREFIX_WORDS = new Set(['unleash', 'unleashed'])

function key(s: string): string {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(e-?bike|electric|e-?trike|trike|bike)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

function stripBrand(name: string, brand: string): string {
  const b = brand.trim().toLowerCase()
  const words = name.trim().split(/\s+/)
  if (b && words.length > 1 && words[0].toLowerCase() === b) words.shift()
  return words.join(' ')
}

function displayCatalogName(name: string, brand: string): string {
  return stripBrand(name, brand).replace(/\s+e-?bike$/i, '').trim()
}

export function baseModelName(catalog: CatalogModel[], brand: string, model: string): string {
  const raw = String(model ?? '').trim()
  if (!raw) return 'Unknown model'

  // Drop invoice notes in brackets and the shop's own name prefix.
  let words = raw.replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean)
  words = stripBrand(words.join(' '), brand).split(/\s+/)
  while (words.length > 1 && PREFIX_WORDS.has(words[0].toLowerCase())) words.shift()
  const cleaned = words.join(' ')

  const typed = key(cleaned)
  const brandLc = brand.trim().toLowerCase()
  let best: CatalogModel | null = null
  let bestLen = 0
  for (const m of catalog) {
    if (m.brand.trim().toLowerCase() !== brandLc) continue
    const k = key(stripBrand(m.name, m.brand))
    if (k.length >= 2 && typed.startsWith(k) && k.length > bestLen) {
      best = m
      bestLen = k.length
    }
  }
  if (best) return displayCatalogName(best.name, best.brand)

  const kept: string[] = []
  for (const w of words) {
    if (kept.length > 0 && VARIANT_WORDS.has(w.toLowerCase().replace(/[^a-z-]/g, ''))) break
    kept.push(w)
  }
  return kept.join(' ').replace(/\s+e-?bike$/i, '').trim() || cleaned
}
