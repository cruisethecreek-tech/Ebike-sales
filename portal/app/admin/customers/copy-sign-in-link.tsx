'use client'

import { useState, useTransition } from 'react'
import { createSignInLink } from './actions'

/**
 * Make a one-time sign-in link and put it on the clipboard, ready to paste
 * into a text. The link is also shown, in case the browser blocks copying.
 */
export function CopySignInLink({ customerId }: { customerId: string }) {
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [ok, setOk] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <span className="inline-flex flex-col gap-1 w-full">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setUrl('')
            try {
              const res = await createSignInLink(customerId)
              setOk(res.ok)
              if (res.ok && res.url) {
                setUrl(res.url)
                try {
                  await navigator.clipboard.writeText(res.url)
                  setMessage(res.message)
                } catch {
                  setMessage('Copy the link below. It works once and expires in about an hour.')
                }
              } else {
                setMessage(res.message)
              }
            } catch (err) {
              setOk(false)
              setMessage(err instanceof Error ? err.message : 'Something went wrong.')
            }
          })
        }
        className="w-full px-3.5 py-2.5 rounded-lg border border-[#2D4A32] text-[#2D4A32] bg-white text-xs font-bold hover:bg-[#E8F3EA] disabled:opacity-60"
      >
        {pending ? 'Making link…' : '🔗 Copy Sign-In Link (to text)'}
      </button>
      {message && (
        <span className={`text-[11px] ${ok ? 'text-[#2D4A32] font-semibold' : 'text-[#9B2C2C]'}`}>
          {ok ? '✓ ' : ''}
          {message}
        </span>
      )}
      {url && (
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Sign-in link"
          className="w-full text-[11px] border border-[#E8DCC4] rounded px-2 py-1 bg-white"
        />
      )}
    </span>
  )
}
