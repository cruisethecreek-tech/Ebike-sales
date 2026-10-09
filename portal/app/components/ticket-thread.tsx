export type TicketMessage = {
  id: string
  ticket_id: string
  from_staff: boolean
  body: string
  created_at: string
}

/** Shop time, not the server's UTC, so "6:57 PM" means 6:57 PM in Ohio. */
export function shopTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * The back-and-forth on one service ticket, oldest first. Shared by the
 * customer's Support page and Admin > Tickets; `viewer` decides which side
 * is labelled "You".
 */
export function TicketThread({ messages, viewer }: { messages: TicketMessage[]; viewer: 'staff' | 'customer' }) {
  if (messages.length === 0) return null
  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const mine = viewer === 'staff' ? m.from_staff : !m.from_staff
        const who = m.from_staff ? (viewer === 'staff' ? 'Shop (you)' : 'Cruise the Creek') : viewer === 'staff' ? 'Customer' : 'You'
        return (
          <div
            key={m.id}
            className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
              mine ? 'ml-auto bg-[#E8F3EA] text-[#1A2E1C]' : 'bg-[#F5F0E8] text-[#1A2E1C]'
            }`}
          >
            <p className="text-[11px] font-bold text-[#4A4A4A]">
              {who} · {shopTime(m.created_at)}
            </p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        )
      })}
    </div>
  )
}

/** Group reply rows by ticket id, keeping their order. */
export function messagesByTicket(rows: TicketMessage[] | null | undefined): Map<string, TicketMessage[]> {
  const map = new Map<string, TicketMessage[]>()
  for (const m of rows || []) {
    const list = map.get(m.ticket_id)
    if (list) list.push(m)
    else map.set(m.ticket_id, [m])
  }
  return map
}
