'use client'

import { useState } from 'react'

export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="btn-primary px-4 py-2 text-[#2D4A32] font-bold rounded shadow-sm hover:opacity-90 transition-opacity"
    >
      {copied ? 'Copied!' : 'Copy Code'}
    </button>
  )
}
