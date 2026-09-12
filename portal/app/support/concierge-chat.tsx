'use client'

import { useState, useRef, useEffect } from 'react'
import { useSeasonalTheme } from '@/app/components/seasonal-theme-provider'

interface Message {
  role: 'assistant' | 'user'
  content: string
  options?: string[] | null
  time: string
}

interface ConciergeChatProps {
  customerName: string
  bikeSummary: string
}

function parseOptions(raw: string) {
  const m = String(raw || '').match(/\n?\s*\[OPTIONS:\s*([^\]]+)\]\s*$/i)
  if (!m) return { text: raw, options: null }
  const opts = m[1].split('|').map((s) => s.trim()).filter(Boolean)
  if (!opts.length) return { text: raw, options: null }
  return { text: raw.slice(0, m.index).trim(), options: opts }
}

function renderFormattedMessage(text: string) {
  // Simple, safe Markdown-lite renderer with HTML / Phone / URL auto-linking
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Bold & Italics
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>')

  // Auto-link full URLs
  s = s.replace(/(https?:\/\/[^\s)<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="underline text-[#2D4A32] font-semibold hover:text-[#C9A96E]">$1</a>')

  // Auto-link .html pages
  s = s.replace(/\b([a-zA-Z0-9_-]+\.html(?:#[a-zA-Z0-9_-]+)?)\b/g, '<a href="https://cruisethecreek.com/$1" target="_blank" rel="noopener" class="underline text-[#2D4A32] font-semibold hover:text-[#C9A96E]">$1</a>')

  // Auto-link phone numbers
  s = s.replace(/\b(\(?330\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g, (match) => {
    const cleanDigits = match.replace(/\D/g, '')
    return `<a href="tel:${cleanDigits}" class="underline text-[#2D4A32] font-semibold hover:text-[#C9A96E]">${match}</a>`
  })

  // Convert newlines to breaks
  s = s.replace(/\n/g, '<br/>')

  return s
}

export function ConciergeChat({ customerName, bikeSummary }: ConciergeChatProps) {
  const initialGreeting = `Hey ${customerName || 'there'}! I'm your Creek Concierge — powered by Claude with live knowledge of your ${bikeSummary || 'e-bike on file'}, Creek Ready tune-ups ($125), error codes, trail regulations, and shop policies. How can I help you today?`

  const { season } = useSeasonalTheme()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: initialGreeting,
      options: ['Tune-up details', 'Error code lookup', 'Battery care', 'Trail speed limit'],
      time: 'Just now',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [imgError, setImgError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleReset() {
    setMessages([
      {
        role: 'assistant',
        content: initialGreeting,
        options: ['Tune-up details', 'Error code lookup', 'Battery care', 'Trail speed limit'],
        time: 'Just now',
      },
    ])
    setInput('')
  }

  async function sendMessage(textToSend: string) {
    if (!textToSend.trim() || loading) return

    const userMsg = textToSend.trim()
    setInput('')
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // Build history to send to upstream Claude
    const currentHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Add user message locally
    setMessages((prev) => [
      ...prev.map((m) => ({ ...m, options: null })), // clear older chips
      { role: 'user', content: userMsg, time: now },
    ])
    setLoading(true)

    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: currentHistory,
        }),
      })

      const data = await res.json()

      if (data && data.reply) {
        const { text: cleanReply, options } = parseOptions(data.reply)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: cleanReply,
            options: options,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      } else {
        throw new Error('No reply')
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I'm having a quick connection blip. You can text Dru directly at 330-406-9682 or rentals at 330-406-9686 for the human team!`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  const quickPrompts = [
    '🔧 What is Creek Ready Tune-Up?',
    '🔋 Battery winter care & storage',
    '🚲 Recommended tire PSI',
    '🌲 Mill Creek Trail 15 MPH rules',
  ]

  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-md overflow-hidden flex flex-col h-[560px]">
      {/* Concierge Mascot Header matching Main Website */}
      {/* Header follows the active season rather than a fixed forest green,
          so it shifts with the banner and navbar above it. */}
      <div
        className="p-3.5 text-white flex items-center justify-between border-b"
        style={{ background: season.bgGradient, borderColor: season.accentColor + '55' }}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className="w-11 h-11 rounded-full border-2 flex items-center justify-center overflow-hidden shadow-inner"
              style={{ background: season.secondaryColor, borderColor: season.accentColor }}
            >
              {!imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/media/mascot.jpg"
                  alt="Creek Concierge Bear Mascot"
                  className="w-full h-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <span className="font-bold text-sm text-[#C9A96E]">CC</span>
              )}
            </div>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-[#1A2E1C] rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className="uppercase tracking-wide font-bold text-base text-[#F5F0E8] leading-tight"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                Creek Concierge
              </h3>
            </div>
            <p className="text-[11px] text-[#C9A96E] flex items-center gap-1">
              <span>●</span> Usually replies right away
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs px-2.5 py-1 rounded bg-[#2D4A32] text-[#F5F0E8] font-semibold hover:bg-[#C9A96E] hover:text-[#1A2E1C] transition-colors border border-[#C9A96E]/30"
            title="Clear chat and restart conversation"
          >
            RESET
          </button>
          <a
            href="tel:3304069682"
            className="text-xs px-2.5 py-1 rounded bg-[#C9A96E] text-[#1A2E1C] font-bold hover:bg-[#dbb978] transition-colors"
          >
            📞 Call
          </a>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#FBF7EF] text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] p-3.5 rounded-2xl leading-relaxed shadow-xs ${
                m.role === 'user'
                  ? 'bg-[#2D4A32] text-white rounded-br-none'
                  : 'bg-white text-[#1A1A1A] border border-[#E5E5E5] rounded-bl-none'
              }`}
              dangerouslySetInnerHTML={{
                __html: renderFormattedMessage(m.content),
              }}
            />

            {/* Interactive Reply Chips from Claude */}
            {m.options && m.options.length > 0 && idx === messages.length - 1 && (
              <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                {m.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={loading}
                    onClick={() => sendMessage(opt)}
                    className="px-3 py-1 text-[11px] font-bold rounded-full bg-white text-[#2D4A32] border border-[#C9A96E] hover:bg-[#C9A96E] hover:text-[#1A2E1C] transition-all shadow-2xs active:scale-95 disabled:opacity-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <span className="text-[10px] text-gray-400 mt-1 px-1">{m.time}</span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 italic text-[11px] p-2 bg-white/70 border border-[#E5E5E5] rounded-xl w-fit">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2D4A32] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#2D4A32] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#2D4A32] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>Creek Concierge is thinking…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-3 py-2 bg-[#F5F0E8] border-t border-[#E5E5E5] flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={loading}
            onClick={() => sendMessage(prompt.replace(/^[^\w]+/, ''))}
            className="flex-shrink-0 px-2.5 py-1 rounded-full bg-white text-[#2D4A32] font-semibold border border-[#C9A96E]/50 hover:border-[#2D4A32] hover:bg-[#FAF8F2] transition-colors whitespace-nowrap shadow-2xs"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleFormSubmit}
        className="p-3 bg-white border-t border-[#E5E5E5] flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about rentals, bikes, services, error codes..."
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#C9A96E]/80 bg-[#FAF8F2] text-xs text-[#1A1A1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32] focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-9 h-9 rounded-full bg-[#C9A96E] text-[#1A2E1C] font-bold flex items-center justify-center hover:bg-[#dbb978] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0 text-base"
          aria-label="Send message"
        >
          →
        </button>
      </form>

      {/* Footer Disclaimer */}
      <div className="py-1 px-3 bg-[#FAF8F2] border-t border-gray-100 text-[10px] text-gray-400 text-center leading-tight">
        Replies powered by Claude. Not always perfect — text Dru directly at 330-406-9682 for human staff assistance.
      </div>
    </div>
  )
}
