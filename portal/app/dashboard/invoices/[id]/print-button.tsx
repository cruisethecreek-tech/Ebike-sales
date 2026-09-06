'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#2D4A32] text-white hover:bg-[#1A2E1C] active:scale-95 transition-all shadow-sm"
      title="Print or save as PDF"
    >
      <span>🖨️</span>
      <span>Print / Save PDF</span>
    </button>
  )
}
