import Link from 'next/link'

export function GoogleReviewCard() {
  const reviewUrl = 'https://maps.app.goo.gl/gtvVMSKqfzgzoHkQ6'

  return (
    <div className="bg-gradient-to-br from-[#1A2E1C] to-[#2D4A32] rounded-2xl p-5 sm:p-6 text-white shadow-sm border border-[#C9A96E]/30 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex text-amber-400 text-lg tracking-widest">
            ★★★★★
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-[#C9A96E] text-[#1A2E1C] font-bold uppercase">
            5.0 Stars
          </span>
        </div>
        <span className="text-xs text-[#C9A96E] font-medium">
          Youngstown & Canfield, OH
        </span>
      </div>

      <div>
        <h3
          className="uppercase tracking-wide text-2xl text-[#F5F0E8]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          Love Riding With Cruise The Creek?
        </h3>
        <p className="text-xs text-gray-300 mt-1 max-w-xl">
          Your reviews help other riders find our trailside shop and support local e-biking in the Mahoning Valley!
        </p>
      </div>

      <div className="pt-2">
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-xs px-5 py-2.5 inline-flex items-center gap-2 font-bold shadow-md hover:scale-105 transition-transform"
        >
          ⭐ Leave Us a 5-Star Google Review ↗
        </a>
      </div>
    </div>
  )
}
