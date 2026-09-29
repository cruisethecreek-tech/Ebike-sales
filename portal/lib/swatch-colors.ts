/**
 * Colour names to swatch hexes, for bikes whose catalogue entry has a name
 * but no hex.
 *
 * A copy of SWATCH_COLORS in the storefront's site-enhance.js, so a bike's
 * swatch in the portal matches the one on the shop page it was bought from.
 * lib/swatch-colors.test.mjs fails if the two drift apart: change both.
 */
export const SWATCH_COLORS: Record<string, string | [string, string]> = {
  'black': '#1A1A1A',
  'phantom black': '#141414',
  'stealth black': '#17181A',
  'crystal black': '#202124',
  'obsidian black': '#15171A',
  'cool black': '#1F2124',
  'leather black': '#23211F',
  'black knight': '#181818',
  'white': '#F2F2EF',
  'arctic white': '#F4F6F7',
  'polar white': '#F3F5F6',
  'pearl white': '#F0EEE8',
  'white sprite': '#F2F3F1',
  'grey': '#8A8D90',
  'gray': '#8A8D90',
  'smoke grey': '#77797C',
  'stone gray': '#8E8C87',
  'brown gray': '#7A6E63',
  'shadow steel': '#5F6469',
  'slate gray': '#6D7780',
  'slate grey': '#6D7780',
  'silver': '#C2C5C8',
  'platinum': '#CFD2D4',
  'blue': '#2F5DA8',
  'steel blue': '#4A6D8C',
  'dark blue': '#26364F',
  'darkblue': '#26364F',
  'marine blue': '#2C4A6E',
  'electric blue': '#1F6FD0',
  'frozen blue': '#8FB6CE',
  'sky blue': '#8FC4DE',
  'skyblue': '#8FC4DE',
  'lapis': '#2A4C8F',
  'denim': '#4C6280',
  'cyan': '#2BB3C0',
  'green': '#3E7A4E',
  'olive green': '#6B7042',
  'pine green': '#28503C',
  'sage': '#9CA88C',
  'mint': '#A8D8C2',
  'mint green': '#A8D8C2',
  'aqua green': '#6FB4A3',
  'cyan green': '#3FB39A',
  'venom green': '#7BC043',
  'red': '#B3262E',
  'crimson red': '#A62231',
  'cherry crimson': '#9E1F33',
  'firebrick': '#9C3028',
  'orange': '#D9702A',
  'vibrant orange': '#E8701A',
  'hazelnut yellow': '#C99A3E',
  'pink': '#E58FB0',
  'crystal pink': '#E8B4C0',
  'purple': '#6B4C8A',
  'mocha': '#6E5647',
  'tan': '#C4A484',
  'khaki': '#A3956B',
  'black and red': ['#1A1A1A', '#A62231'],
  'black and blue': ['#1A1A1A', '#2C4A6E'],
  'blue and grey': ['#3E5C7E', '#8A8D90'],
  'yellow and black': ['#D8B23A', '#1A1A1A'],
  'panda': ['#1A1A1A', '#F2F2EF'],
}

export function normalizeColorName(name: unknown): string {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** #888888 is salespro's unpicked-colour placeholder, not a colour. */
function isPlaceholder(hex: string): boolean {
  return /^#8{3}(8{3})?$/.test(hex)
}

/**
 * The hex to show for a swatch: the catalogue's own, unless it is missing or
 * the placeholder, then the name table. Null when neither knows; the caller
 * shows the name alone rather than invent a colour.
 */
export function resolveSwatchHex(name: unknown, hex?: string | null): string | null {
  const own = String(hex || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(own) && !isPlaceholder(own)) return own.toUpperCase()
  const hit = SWATCH_COLORS[normalizeColorName(name)]
  if (!hit) return null
  return (Array.isArray(hit) ? hit[0] : hit).toUpperCase()
}
