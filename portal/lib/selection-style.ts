/**
 * How "this is the customer you are working on" looks.
 *
 * It used to be `bg-[#2D4A32]/10` — the brand green at ten percent, which on a
 * cream page lands as a barely-there grey. Next to a hover state of `#FBF7EF`
 * it was almost the same colour, so the one row that mattered looked like the
 * one the mouse happened to be over.
 *
 * Gold is the right answer and it was already in the palette: #C9A96E is the
 * shop's accent, it is the only warm note in a green-and-cream scheme, and
 * nothing else on these screens uses it as a fill. A gold wash with a solid
 * gold edge reads as "here" from across the room, while the text stays
 * #1A2E1C on a light ground and loses no contrast.
 *
 * Defined once because the selection appears in four places — the desktop
 * table, the mobile cards, the search dock's grid and the drawer itself — and
 * four hand-tuned variants is how they drift apart.
 */

/** Gold wash + gold left edge. For a table row, which cannot take a ring. */
export const SELECTED_ROW =
  'bg-[#F3E6C9] font-semibold shadow-[inset_3px_0_0_0_#C9A96E]'

/** What an unselected row does on hover. */
export const UNSELECTED_ROW = 'hover:bg-[#FBF7EF]'

/** Gold wash, green border, gold halo. For anything with its own box. */
export const SELECTED_CARD =
  'bg-[#F3E6C9] border-[#2D4A32] ring-2 ring-[#C9A96E] shadow-md'

export const UNSELECTED_CARD = 'bg-white border-[#E5E5E5] hover:border-[#2D4A32]'

/** The open drawer or panel for the selected customer. */
export const SELECTED_PANEL =
  'bg-white border-2 border-[#2D4A32] ring-4 ring-[#C9A96E]/45 shadow-lg'

/** The "currently viewing" label that sits at the top of that panel. */
export const SELECTED_BADGE =
  'bg-[#C9A96E] text-[#1A2E1C] font-bold uppercase tracking-wider'

/** The button on the row that is already selected — a state, not an action. */
export const SELECTED_BUTTON = 'bg-[#C9A96E] text-[#1A2E1C] hover:bg-[#dbb978]'
export const UNSELECTED_BUTTON = 'bg-[#2D4A32] text-white hover:bg-[#1A2E1C]'
