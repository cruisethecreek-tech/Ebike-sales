import { getViewerContext } from '@/lib/view-as'
import { stopViewingAs } from '@/app/dashboard/view-as-actions'

/**
 * Says, on every page, that what is on screen is somebody else's portal.
 *
 * Unmissable on purpose. A preview that looks exactly like the real thing is
 * only safe if there is never a moment where staff cannot tell which it is —
 * the danger is not seeing a customer's invoices, it is forgetting whose they
 * are and acting on them.
 */
export async function ViewingAsBanner() {
  const { viewingAs } = await getViewerContext()
  if (!viewingAs) return null

  return (
    <div className="sticky top-0 z-40 -mx-4 md:-mx-8 mb-4 px-4 md:px-8 py-2.5 bg-[#C9A96E] border-b-2 border-[#1A2E1C] text-[#1A2E1C]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-bold uppercase tracking-wide">
          👁 Previewing as {viewingAs.name} — this is their portal, not yours. Nothing you do
          here is saved to their account.
        </p>
        <form action={stopViewingAs}>
          <button
            type="submit"
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#1A2E1C] text-[#F5F0E8] hover:bg-[#2D4A32]"
          >
            ✕ Stop previewing
          </button>
        </form>
      </div>
    </div>
  )
}
