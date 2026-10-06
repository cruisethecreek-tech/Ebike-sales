import { EMAIL_KIND_LABELS } from '@/lib/email-tracking'

export type EmailSent = {
  token: string
  kind: string
  subject: string | null
  ref: string | null
  status: 'sent' | 'failed'
  error: string | null
  sent_at: string
  first_opened_at: string | null
  last_opened_at: string | null
  open_count: number
  first_clicked_at: string | null
  last_clicked_at: string | null
  click_count: number
}

// Shop time, so the server and the browser print the same thing.
function when(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      })
}

const times = (n: number) => (n > 1 ? ` · ${n} times` : '')

/** The customer's emails, newest first, with sent / opened / clicked. */
export function EmailsSent({ emails }: { emails: EmailSent[] }) {
  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <h4 className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">📧 Emails Sent ({emails.length}):</h4>
      {emails.length > 0 ? (
        <ul className="space-y-1.5">
          {emails.map((e) => (
            <li key={e.token} className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5] text-xs space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold text-[#2D4A32]">{EMAIL_KIND_LABELS[e.kind] || e.kind}</span>
                {e.ref && <span className="font-mono text-gray-600">{e.ref}</span>}
              </div>
              {e.subject && <div className="text-gray-500">{e.subject}</div>}
              {e.status === 'failed' ? (
                <div className="text-[#B91C1C] font-semibold">
                  ❌ Not sent {when(e.sent_at)}
                  {e.error ? `: ${e.error}` : ''}
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-gray-600">✉️ Sent {when(e.sent_at)}</span>
                  {e.first_clicked_at ? (
                    <span className="font-semibold text-[#15803D]">
                      👆 Clicked {when(e.last_clicked_at)}
                      {times(e.click_count)}
                    </span>
                  ) : null}
                  {e.first_opened_at ? (
                    <span className="font-semibold text-[#8A6D2F]">
                      👀 Opened {when(e.first_opened_at)}
                      {times(e.open_count)}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not opened yet</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 italic">No emails recorded yet. Emails are listed from when this was turned on.</p>
      )}
      <p className="text-[11px] text-gray-400">
        Opened means the email&apos;s hidden picture loaded. iPhone Mail can load it by itself, and some people block
        pictures, so treat opened as a hint. Clicked means they tapped a link in it.
      </p>
    </div>
  )
}
