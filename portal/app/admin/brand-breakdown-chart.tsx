'use client'

import { useState } from 'react'

interface BrandStats {
  brand: string
  count: number
  percentage: number
  color: string
  models: Array<{ model: string; count: number }>
}

interface BrandBreakdownChartProps {
  stats: BrandStats[]
  totalBikes: number
}

export function BrandBreakdownChart({ stats, totalBikes }: BrandBreakdownChartProps) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(stats[0]?.brand || null)

  const activeStats = stats.find(s => s.brand === selectedBrand) || stats[0]

  // Calculate SVG donut slice angles
  let accumulatedAngle = 0
  const slices = stats.map((item) => {
    const angle = (item.count / totalBikes) * 360
    const startAngle = accumulatedAngle
    accumulatedAngle += angle

    // SVG coordinates
    const startRad = ((startAngle - 90) * Math.PI) / 180
    const endRad = ((startAngle + angle - 90) * Math.PI) / 180
    const r = 40
    const cx = 50
    const cy = 50

    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0

    const pathData = totalBikes > 0 && angle < 360
      ? `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
      : `M ${cx - r}, ${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`

    return {
      ...item,
      pathData,
      startAngle,
      angle,
    }
  })

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#E5E5E5] space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3
            className="uppercase tracking-wide text-xl text-[#1A2E1C]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
          >
            🚴 E-Bike Brand & Model Breakdown
          </h3>
          <p className="text-xs text-[#4A4A4A]">Click any brand slice to drill down into specific models</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#F5F0E8] font-bold text-[#2D4A32]">
          {totalBikes} Registered Bikes
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* SVG Donut / Pie Chart */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-48 h-48 sm:w-56 sm:h-56">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              {slices.map((slice) => (
                <path
                  key={slice.brand}
                  d={slice.pathData}
                  fill={slice.color}
                  className="cursor-pointer transition-all duration-300 hover:opacity-90"
                  style={{
                    transformOrigin: '50% 50%',
                    transform: selectedBrand === slice.brand ? 'scale(1.05)' : 'scale(1)',
                    filter: selectedBrand === slice.brand ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' : 'none'
                  }}
                  onClick={() => setSelectedBrand(slice.brand)}
                />
              ))}
              {/* Inner Cutout for Donut */}
              <circle cx="50" cy="50" r="24" fill="#ffffff" />
            </svg>

            {/* Center Stat */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Top Brand</span>
              <span className="text-sm sm:text-base font-bold text-[#1A2E1C]">
                {activeStats?.brand}
              </span>
              <span className="text-xs font-bold text-[#2D4A32]">
                {activeStats?.percentage.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Legend & Drill-down Models */}
        <div className="md:col-span-7 space-y-4">
          {/* Brand Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stats.map((s) => {
              const isSelected = selectedBrand === s.brand
              return (
                <button
                  key={s.brand}
                  onClick={() => setSelectedBrand(s.brand)}
                  className={`p-2.5 rounded-xl text-left border transition-all text-xs flex items-center justify-between ${
                    isSelected
                      ? 'border-[#2D4A32] bg-[#2D4A32]/10 ring-2 ring-[#2D4A32]'
                      : 'border-gray-200 bg-[#FBF7EF] hover:border-[#2D4A32]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="font-bold text-[#1A2E1C] truncate">{s.brand}</span>
                  </div>
                  <span className="font-semibold text-[#2D4A32]">{s.count} ({s.percentage.toFixed(0)}%)</span>
                </button>
              )
            })}
          </div>

          {/* Drill-down Models Card */}
          {activeStats && (
            <div className="p-4 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D4A32]">
                  {activeStats.brand} Models Breakdown ({activeStats.count} bikes)
                </h4>
                <span className="text-[11px] text-gray-500 font-medium">
                  {activeStats.models.length} model variant{activeStats.models.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {activeStats.models.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-white flex items-center justify-between text-xs border border-gray-100 shadow-2xs"
                  >
                    <span className="font-medium text-[#1A1A1A]">{m.model}</span>
                    <span className="font-bold px-2 py-0.5 rounded bg-[#2D4A32] text-white text-[11px]">
                      {m.count} sold
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
