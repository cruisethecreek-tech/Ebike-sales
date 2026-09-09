'use client'

import { useState } from 'react'

interface QRCodeModalProps {
  url: string
  title?: string
  code?: string
}

export function QRCodeCard({ url, title = 'Referral QR Code', code }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false)

  // Use Google Chart API or standard reliable QR endpoint for instant high-res QR SVG/PNG
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}&color=2D4A32&bgcolor=F5F0E8&margin=1`

  function handleCopy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: 'Cruise the Creek Adventures Referral',
        text: `Get $100 off your next e-bike or tune-up at Cruise the Creek Adventures! Use referral code: ${code || ''}`,
        url,
      }).catch(() => {})
    } else {
      handleCopy()
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E5E5E5] shadow-sm text-center space-y-4">
      <div className="space-y-1">
        <h4
          className="uppercase tracking-wide text-xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          📱 {title}
        </h4>
        <p className="text-xs text-[#4A4A4A]">
          Have friends scan this QR Code with their phone camera to sign up with your code!
        </p>
      </div>

      <div className="flex justify-center p-3 bg-[#F5F0E8] rounded-xl border border-[#6B8F71]/30 max-w-[200px] mx-auto shadow-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrImageUrl}
          alt="Referral QR Code"
          width={180}
          height={180}
          className="rounded-lg shadow-sm"
        />
      </div>

      {code && (
        <div className="text-xs">
          <span className="text-gray-500">Your Code: </span>
          <span className="font-mono font-bold text-sm text-[#2D4A32] bg-[#F5F0E8] px-2.5 py-1 rounded-md">
            {code}
          </span>
        </div>
      )}

      <div className="flex justify-center gap-2 pt-1">
        <button
          onClick={handleCopy}
          className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm font-bold"
        >
          {copied ? '✅ Link Copied!' : '📋 Copy Link'}
        </button>
        <button
          onClick={handleShare}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-[#1A2E1C] text-[#F5F0E8] hover:bg-[#2D4A32] transition-colors shadow-sm"
        >
          📲 Share
        </button>
      </div>
    </div>
  )
}
