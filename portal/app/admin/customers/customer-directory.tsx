'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { STORE_URL } from '@/lib/constants'
import { newInvoiceUrl } from '@/lib/generator-link'
import { canonicalInvoiceNumber } from '@/lib/invoice-number'
import { adminUpdateBike, adminAddBike, adminDeleteBike } from './actions'
import { DeleteInvoiceButton } from '../invoices/delete-invoice-button'
import { SendInviteButton } from './send-invite-button'
import { EditCustomerDetails } from './edit-customer-details'
import { ViewAsButton } from '@/app/admin/view-as-button'
import { RemoveCustomer } from './remove-customer'
import { BulkActions, type BulkCustomer } from './bulk-actions'
import { CreekGuardBadge } from '@/app/components/creekguard-badge'
import {
  SELECTED_ROW,
  UNSELECTED_ROW,
  SELECTED_CARD,
  UNSELECTED_CARD,
  SELECTED_PANEL,
  SELECTED_BADGE,
  SELECTED_BUTTON,
  UNSELECTED_BUTTON,
} from '@/lib/selection-style'

interface Bike {
  id: string
  brand: string
  model: string
  serial_number?: string | null
  receipt_number?: string | null
  purchase_date?: string | null
  shop_invoice_url?: string | null
  delivered_on?: string | null
}

interface CustomerData {
  id: string
  first_name: string
  last_name: string
  phone?: string | null
  email?: string | null
  preferred_contact?: string | null
  referral_code?: string | null
  is_admin?: boolean
  /** Has signed into the portal at least once (from auth.users). */
  registered?: boolean
  lastSignInAt?: string | null
  invitedAt?: string | null
  invoiceCount: number
  /** Everything this customer has been billed, whatever the status. */
  totalSpent: number
  totalInvoiced?: number
  totalPaid?: number
  /** Billed but not yet marked paid. */
  totalOutstanding?: number
  bikes: Bike[]
  /** One of their bikes has an active GPS tracker. */
  creekGuard?: boolean
  /** This customer's invoices in the portal, newest first. */
  invoices?: { id: string; invoice_number: string | null; total_amount: number; status: string; issued_at: string | null }[]
  latestPurchaseDate?: string | null
  /** Set when hidden from the directory. Their data is untouched. */
  archived_at?: string | null
}

export function getGoogleVoiceUrls(phone?: string | null) {
  if (!phone) return { callUrl: '#', textUrl: '#' }
  const digits = phone.replace(/\D/g, '')
  const num = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return {
    callUrl: `https://voice.google.com/u/0/calls?a=nc,%2B1${num}`,
    textUrl: `https://voice.google.com/u/0/messages?itemId=t.%2B1${num}`,
  }
}

export function formatCustomerName(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName || '').trim()
  let l = (lastName || '').trim()
  if (
    l.toLowerCase() === '(none)' ||
    l.toLowerCase() === 'none' ||
    l.toLowerCase() === 'null' ||
    l.toLowerCase() === 'undefined'
  ) {
    l = ''
  }
  const full = `${f} ${l}`.trim()
  return full || 'Customer'
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '\u2014' : d.toLocaleDateString()
}

/** Registered = has signed in. Everyone else was invited and never arrived. */
/**
 * Three states, not two.
 *
 * This badge used to read "⏳ Invited" for anyone who had not signed in, which
 * is not the same question. 53 of 61 accounts were created in bulk by
 * scripts/import-invoices.ts using admin.createUser — which writes a user and
 * sends nothing. Only inviteUserByEmail sends an invite, and only it sets
 * invited_at. So the directory told the shop it had invited 53 customers who
 * had never been contacted, and their silence looked like people ignoring an
 * email rather than an email that was never sent.
 *
 * invitedAt was already being read from auth.users. It just was not consulted.
 */
export function SignupBadge({ customer, size = 'sm' }: { customer: CustomerData; size?: 'sm' | 'md' }) {
  const pad = size === 'md' ? 'px-2.5 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
  const base = `${pad} rounded font-bold uppercase tracking-wide whitespace-nowrap`

  if (customer.registered) {
    return (
      <span
        title={customer.lastSignInAt ? `Last signed in ${formatWhen(customer.lastSignInAt)}` : 'Signed in'}
        className={`${base} bg-[#2D4A32] text-white`}
      >
        ✓ Registered
      </span>
    )
  }

  if (customer.invitedAt) {
    return (
      <span
        title={`Invited ${formatWhen(customer.invitedAt)} \u2014 never signed in`}
        className={`${base} bg-[#C9A96E]/25 text-[#8a6d2f] border border-[#C9A96E]`}
      >
        ⏳ Invited
      </span>
    )
  }

  return (
    <span
      title="This account exists but no invite email has ever been sent to it. They cannot know the portal is there."
      className={`${base} bg-[#FDECEC] text-[#9B2C2C] border border-[#F0B4B4]`}
    >
      ✉ Not invited
    </span>
  )
}

/**
 * The date behind the badge, for the list rows. The badge alone answers
 * "have they ever signed in"; this answers "when", which is the question
 * you actually have when scanning the directory.
 */
export function SignupWhen({ customer }: { customer: CustomerData }) {
  if (customer.registered) {
    if (!customer.lastSignInAt) return null
    return (
      <span className="text-[11px] text-gray-500">
        Last in {formatWhen(customer.lastSignInAt)}
      </span>
    )
  }
  if (customer.invitedAt) {
    return (
      <span className="text-[11px] text-[#8a6d2f]">
        Invited {formatWhen(customer.invitedAt)} · never signed in
      </span>
    )
  }
  // "Never signed in" was true but misleading: it reads as a choice they made.
  return (
    <span className="text-[11px] text-[#9B2C2C]">
      No invite sent — they have never been told the portal exists
    </span>
  )
}

/** Two clicks, like deleting an invoice: a stray tap must not remove a bike. */
function RemoveBikeButton({ bikeId, label }: { bikeId: string; label: string }) {
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setPending(true)
    const r = await adminDeleteBike(bikeId)
    setPending(false)
    if (!r.ok) { setError(r.message); setArmed(false) }
  }

  if (!armed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setArmed(true); setError(null) }}
          className="px-2 py-1 rounded border border-[#B3261E] text-[#B3261E] text-[11px] font-semibold hover:bg-[#FDECEA]"
        >
          Remove bike
        </button>
        {error && <span role="alert" className="text-[10px] font-semibold text-[#B3261E]">{error}</span>}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="px-2 py-1 rounded bg-[#B3261E] text-white text-[11px] font-bold hover:bg-[#8C1D18] disabled:opacity-60"
      >
        {pending ? 'Removing…' : `Remove ${label}`}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="px-2 py-1 rounded border border-[#C9A96E] text-[#2D4A32] text-[11px] font-semibold hover:bg-white disabled:opacity-60"
      >
        Cancel
      </button>
    </span>
  )
}

function BikeAdminCard({
  bike,
  knownInvoiceNumbers,
  shopInvoiceByNumber,
}: {
  bike: Bike
  knownInvoiceNumbers?: Set<string>
  /** Shop invoice links on invoices, by canonical invoice number. */
  shopInvoiceByNumber?: Map<string, string>
}) {
  const [serial, setSerial] = useState(bike.serial_number || '')
  const [receipt, setReceipt] = useState(bike.receipt_number || '')
  const [shopUrl, setShopUrl] = useState(bike.shop_invoice_url || '')
  // The bike's own link wins; otherwise borrow the matching invoice's.
  const fromInvoice = shopInvoiceByNumber?.get(canonicalInvoiceNumber(receipt) || '') || ''
  const shopLink = /^https?:\/\//i.test(shopUrl.trim()) ? shopUrl.trim() : fromInvoice
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSaving(true)
    const fd = new FormData(e.currentTarget)
    await adminUpdateBike(fd)
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSave} className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#E5E5E5] space-y-2.5">
      <input type="hidden" name="bike_id" value={bike.id} />
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-[#2D4A32] text-white text-[10px] uppercase font-bold">
            {bike.brand}
          </span>
          <span className="font-bold text-sm text-[#1A2E1C]">{bike.model}</span>
        </div>
        {bike.purchase_date && (
          <span className="text-gray-600 text-[11px] font-medium">
            📅 {new Date(bike.purchase_date).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {/* Serial Number Slot */}
        <div>
          <label className="block text-[10px] font-bold uppercase text-[#2D4A32] tracking-wider mb-0.5">
            🔢 Bike Serial Number
          </label>
          <input
            type="text"
            name="serial_number"
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
            placeholder="Enter Serial # (e.g. SN12345)"
            className="w-full px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs font-mono font-bold uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
          />
        </div>

        {/* Receipt / Invoice Number Slot */}
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <label className="block text-[10px] font-bold uppercase text-[#2D4A32] tracking-wider">
              🧾 Receipt / Invoice #
            </label>
            {/* Only link to an invoice that exists. Earl's bike said CTR-71
                where the invoice is CTR-071, and the link went to a 404 with
                nothing to explain it — the bike looked registered and the
                invoice was right there. A link that cannot resolve is worse
                than no link, so say so instead. */}
            {receipt && (knownInvoiceNumbers
              ? knownInvoiceNumbers.has(canonicalInvoiceNumber(receipt) || '')
              : true) ? (
              <Link
                href={`/dashboard/invoices/${canonicalInvoiceNumber(receipt)}`}
                target="_blank"
                className="text-[10px] text-[#2D4A32] font-bold hover:underline"
              >
                View Receipt ↗
              </Link>
            ) : receipt ? (
              <span
                className="text-[10px] font-bold text-[#8A6D1F]"
                title="No invoice with this number. Check it against the invoices list."
              >
                ⚠ No matching invoice
              </span>
            ) : null}
          </div>
          <input
            type="text"
            name="receipt_number"
            value={receipt}
            onChange={(e) => setReceipt(e.target.value.toUpperCase())}
            placeholder="Enter Receipt # (e.g. CTR-058)"
            className="w-full px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs font-mono font-bold uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
          />
        </div>
      </div>

      {/* Delivery date: starts the free 30-day break-in tune-up. Blank
          means the portal allows 40 days from purchase for shipping. */}
      <div className="text-xs">
        <label className="block text-[10px] font-bold uppercase text-[#2D4A32] tracking-wider mb-0.5">
          🚚 Delivered on
        </label>
        <input
          type="date"
          name="delivered_on"
          defaultValue={bike.delivered_on || ''}
          className="w-full px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
        />
      </div>

      {/* Shop invoice (Shop.com order / warranty link). Bikes with no invoice
          in the generator keep it here, so it is one click from the card. */}
      <div className="text-xs">
        <div className="flex justify-between items-center mb-0.5">
          <label className="block text-[10px] font-bold uppercase text-[#2D4A32] tracking-wider">
            🔗 Shop invoice link
          </label>
          {shopLink ? (
            <a
              href={shopLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#2D4A32] font-bold hover:underline"
            >
              Open shop invoice ↗{!shopUrl.trim() && fromInvoice ? ` (from ${canonicalInvoiceNumber(receipt)})` : ''}
            </a>
          ) : (
            <span className="text-[10px] text-gray-500">None on file</span>
          )}
        </div>
        <input
          type="url"
          name="shop_invoice_url"
          value={shopUrl}
          onChange={(e) => setShopUrl(e.target.value)}
          placeholder={fromInvoice ? 'Using the link on the invoice' : 'Paste the Shop.com order link'}
          className="w-full px-2.5 py-1.5 rounded-lg border border-[#C9A96E] bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
        />
      </div>

      <div className="flex justify-between items-center pt-1">
        {saved ? (
          <span className="text-xs font-bold text-green-700 animate-fadeIn">
            ✓ Saved Serial & Receipt!
          </span>
        ) : (
          <span className="text-[10px] text-gray-500">
            Changes sync to customer portal immediately.
          </span>
        )}
        <button
          type="submit"
          disabled={isSaving}
          className="px-3 py-1 bg-[#2D4A32] text-white text-xs font-bold rounded-lg hover:bg-[#1A2E1C] transition-colors shadow-2xs"
        >
          {isSaving ? 'Saving...' : '💾 Save Bike Slots'}
        </button>
      </div>
      <div className="flex justify-end pt-1 border-t border-[#E5E5E5]">
        <RemoveBikeButton bikeId={bike.id} label={`${bike.brand} ${bike.model}`.trim()} />
      </div>
    </form>
  )
}

export function CustomerDirectory({
  customers,
  knownInvoiceNumbers,
  shopInvoiceByNumber,
}: {
  customers: CustomerData[]
  /** Every invoice number that exists, canonicalised. Lets a bike card tell a
      real receipt from one that points at nothing. */
  knownInvoiceNumbers?: string[]
  /** Invoice number → that invoice's shop invoice link, where it has one. */
  shopInvoiceByNumber?: Record<string, string>
}) {
  const invoiceNumberSet = useMemo(
    () => new Set((knownInvoiceNumbers || []).map((n) => canonicalInvoiceNumber(n) || '')),
    [knownInvoiceNumbers],
  )
  const shopInvoiceMap = useMemo(
    () => new Map(Object.entries(shopInvoiceByNumber || {}).map(([n, u]) => [canonicalInvoiceNumber(n) || '', u])),
    [shopInvoiceByNumber],
  )
  const [activeLetter, setActiveLetter] = useState<string>('ALL')
  const [signupFilter, setSignupFilter] = useState<'ALL' | 'REGISTERED' | 'INVITED' | 'NOT_INVITED' | 'DUPLICATES'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [showAddBike, setShowAddBike] = useState(false)
  // Archived customers are out of the directory, not out of the database.
  const [showArchived, setShowArchived] = useState(false)
  // Ticked rows, for the bulk bar. Separate from the one selected customer
  // whose drawer is open: ticking is "do this to all of them", selecting is
  // "show me this one".
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const scrollOnArrival = useRef(false)

  const alphabet = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

  // Listen for global customer selection events (e.g. from bottom dock)
  useEffect(() => {
    function handleSelect(e: any) {
      if (e.detail?.id) {
        setSelectedCustomerId(e.detail.id)
      }
    }
    window.addEventListener('ctc-select-customer', handleSelect)

    // Arriving from another screen — e.g. a customer's name on the invoices
    // list — carries the person in the URL. That beats whoever happened to be
    // left in localStorage, because it is the choice just made.
    let fromUrl: string | null = null
    try {
      fromUrl = new URLSearchParams(window.location.search).get('customer')
    } catch (_) {}

    if (fromUrl && customers.some((c) => c.id === fromUrl)) {
      setSelectedCustomerId(fromUrl)
      scrollOnArrival.current = true
      try {
        // Keep the dock's "Now viewing" in step with the drawer.
        localStorage.setItem('ctc_selected_customer_id', fromUrl)
        window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id: fromUrl } }))
        // Drop the parameter so closing the drawer and reloading does not
        // re-open the same person forever.
        const url = new URL(window.location.href)
        url.searchParams.delete('customer')
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      } catch (_) {}
    } else {
      // Check localStorage initial
      try {
        const saved = localStorage.getItem('ctc_selected_customer_id')
        if (saved && customers.some((c) => c.id === saved)) {
          setSelectedCustomerId(saved)
        }
      } catch (_) {}
    }

    return () => window.removeEventListener('ctc-select-customer', handleSelect)
  }, [customers])

  // Only scroll when the customer came in from a link; scrolling the page on
  // every dock click would yank it out from under whoever clicked.
  useEffect(() => {
    if (!scrollOnArrival.current || !selectedCustomerId) return
    scrollOnArrival.current = false
    drawerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedCustomerId])

  function selectCustomer(id: string) {
    setSelectedCustomerId(id)
    try {
      localStorage.setItem('ctc_selected_customer_id', id)
      window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id } }))
    } catch (_) {}
  }

  function clearSelection() {
    setSelectedCustomerId(null)
    try {
      localStorage.removeItem('ctc_selected_customer_id')
      window.dispatchEvent(new CustomEvent('ctc-select-customer', { detail: { id: null } }))
    } catch (_) {}
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // People who are probably in here twice: the same name, whatever the
  // capitalisation or spacing. Usually one account from an invoice import and
  // one the customer made themselves, which is what Merge is for.
  const duplicateIds = useMemo(() => {
    const byName = new Map<string, string[]>()
    for (const c of customers) {
      if (Boolean(c.archived_at) !== showArchived) continue
      const key = formatCustomerName(c.first_name, c.last_name).toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key) continue
      byName.set(key, [...(byName.get(key) || []), c.id])
    }
    return new Set([...byName.values()].filter((ids) => ids.length > 1).flat())
  }, [customers, showArchived])

  // Filter customers by selected letter or search
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Archived people are hidden unless the archive is open. Showing them
      // mixed into the list would defeat the point of archiving; leaving them
      // unreachable would mean nobody could undo it.
      if (Boolean(c.archived_at) !== showArchived) return false

      const cleanName = formatCustomerName(c.first_name, c.last_name).toUpperCase()
      const firstName = (c.first_name || '').trim().toUpperCase()

      // Letter filter
      const matchesLetter =
        activeLetter === 'ALL' ||
        cleanName.startsWith(activeLetter) ||
        firstName.startsWith(activeLetter)

      if (!matchesLetter) return false

      // Sign-up state filter
      if (signupFilter === 'REGISTERED' && !c.registered) return false
      if (signupFilter === 'INVITED' && (c.registered || !c.invitedAt)) return false
      if (signupFilter === 'NOT_INVITED' && (c.registered || c.invitedAt)) return false
      if (signupFilter === 'DUPLICATES' && !duplicateIds.has(c.id)) return false

      // Search query filter
      if (!searchQuery.trim()) return true

      const q = searchQuery.toLowerCase().trim()
      const phone = (c.phone || '').toLowerCase()
      const ref = (c.referral_code || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      const bikeMatch = c.bikes.some((b) => `${b.brand} ${b.model}`.toLowerCase().includes(q))

      return (
        cleanName.toLowerCase().includes(q) ||
        phone.includes(q) ||
        ref.includes(q) ||
        email.includes(q) ||
        bikeMatch
      )
    })
  }, [customers, activeLetter, signupFilter, searchQuery, showArchived, duplicateIds])

  const archivedCount = useMemo(
    () => customers.filter((c) => c.archived_at).length,
    [customers],
  )

  const signupCounts = useMemo(() => {
    // Counted over what the list is currently showing, so the badge numbers
    // and the rows underneath agree.
    const inScope = customers.filter((c) => Boolean(c.archived_at) === showArchived)
    const registered = inScope.filter((c) => c.registered).length
    const invited = inScope.filter((c) => !c.registered && c.invitedAt).length
    return {
      ALL: inScope.length,
      REGISTERED: registered,
      INVITED: invited,
      NOT_INVITED: inScope.length - registered - invited,
      DUPLICATES: duplicateIds.size,
    }
  }, [customers, showArchived, duplicateIds])

  const checkedCustomers: BulkCustomer[] = useMemo(
    () =>
      customers
        .filter((c) => checked.has(c.id))
        .map((c) => ({
          id: c.id,
          name: formatCustomerName(c.first_name, c.last_name),
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          email: c.email,
          registered: c.registered,
          lastSignInAt: c.lastSignInAt,
          is_admin: c.is_admin,
          bikeCount: c.bikes.length,
          invoiceCount: c.invoiceCount,
          totalInvoiced: c.totalInvoiced ?? c.totalSpent,
        })),
    [customers, checked],
  )

  const allVisibleChecked =
    filteredCustomers.length > 0 && filteredCustomers.every((c) => checked.has(c.id))

  function toggleAllVisible() {
    setChecked((prev) => {
      const next = new Set(prev)
      if (allVisibleChecked) filteredCustomers.forEach((c) => next.delete(c.id))
      else filteredCustomers.forEach((c) => next.add(c.id))
      return next
    })
  }

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null
    return customers.find((c) => c.id === selectedCustomerId) || null
  }, [selectedCustomerId, customers])

  function copyReferralLink(code: string) {
    const url = `${STORE_URL}/?ref=${encodeURIComponent(code)}`
    navigator.clipboard.writeText(url)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* ── Portal Sign-Up Filter ── */}
      <div className="bg-white p-3 rounded-xl border border-[#E5E5E5] shadow-xs space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
          🔑 Portal Sign-Up:
        </span>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {([
            { key: 'ALL', label: 'Everyone' },
            { key: 'REGISTERED', label: '✓ Registered' },
            { key: 'INVITED', label: '⏳ Invited, never signed in' },
            { key: 'NOT_INVITED', label: '✉ Never invited' },
            { key: 'DUPLICATES', label: '👯 Possible duplicates' },
          ] as const).map(({ key, label }) => {
            const isOn = signupFilter === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isOn}
                onClick={() => setSignupFilter(key)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  isOn
                    ? 'bg-[#2D4A32] text-white shadow-xs'
                    : 'bg-[#F5F0E8] text-[#2D4A32] hover:bg-[#e8dfd1]'
                }`}
              >
                {label}{' '}
                <span className={isOn ? 'opacity-70' : 'opacity-50'}>{signupCounts[key]}</span>
              </button>
            )
          })}

          {/* The archive. Hidden behind a toggle rather than a separate page,
              because the only way to undo an archive is to be able to find it. */}
          {(archivedCount > 0 || showArchived) && (
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => {
                // Different lists; ticks never carry from one to the other.
                setChecked(new Set())
                setShowArchived((v) => !v)
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ml-auto ${
                showArchived
                  ? 'bg-[#8A6D1F] text-white shadow-xs'
                  : 'bg-white border border-[#C9A96E] text-[#8A6D1F] hover:bg-[#FAF3E4]'
              }`}
            >
              🗄 {showArchived ? 'Back to the directory' : 'Archive'}{' '}
              <span className={showArchived ? 'opacity-70' : 'opacity-60'}>{archivedCount}</span>
            </button>
          )}
        </div>

        {showArchived && (
          <p className="text-[11px] text-[#8A6D1F] font-semibold">
            Showing archived customers. They are hidden from the directory and from the search
            dock; nothing of theirs has been deleted. Select one to restore it — or to delete it
            permanently.
          </p>
        )}
      </div>

      {/* ── Alphabetical Quick-Filter Bar ── */}
      <div className="bg-white p-3 rounded-xl border border-[#E5E5E5] shadow-xs space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A]">
            🔤 Alphabetical Filter:
          </span>
          <div className="text-xs font-semibold text-[#2D4A32]">
            Showing {filteredCustomers.length} of {customers.length} Customers
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
          {alphabet.map((letter) => {
            const isSelected = activeLetter === letter
            return (
              <button
                key={letter}
                onClick={() => setActiveLetter(letter)}
                className={`min-w-[28px] h-7 px-1.5 rounded-lg font-bold transition-all flex items-center justify-center ${
                  isSelected
                    ? 'bg-[#2D4A32] text-white shadow-xs scale-105'
                    : 'bg-[#F5F0E8] text-[#2D4A32] hover:bg-[#e8dfd1]'
                }`}
              >
                {letter}
              </button>
            )
          })}
        </div>

        {/* Live Search Bar */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, phone, bike (e.g. Discover 3), or ref code..."
            className="w-full px-3 py-2 rounded-lg border border-[#C9A96E] bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A32]"
          />
        </div>
      </div>

      {/* ── Selected Customer Actionable Drawer ── */}
      {selectedCustomer && (
        <div
          ref={drawerRef}
          className={`p-5 rounded-2xl space-y-4 animate-fadeIn ${SELECTED_PANEL}`}
        >
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2.5 py-0.5 rounded ${SELECTED_BADGE}`}>
                  👤 Currently Viewing & Active Customer
                </span>
                <SignupBadge customer={selectedCustomer} size="md" />
                {selectedCustomer.creekGuard && <CreekGuardBadge compact />}
                {selectedCustomer.is_admin && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#C9A96E] text-[#1A2E1C] font-bold">
                    👑 ADMIN
                  </span>
                )}
              </div>
              <h3
                className="text-3xl font-bold uppercase mt-1 text-[#1A2E1C]"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {formatCustomerName(selectedCustomer.first_name, selectedCustomer.last_name)}
              </h3>
            </div>
            <button
              onClick={clearSelection}
              className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100"
            >
              ✕ Close
            </button>
          </div>

          {/* Keyed by customer so switching cards resets the form. */}
          <EditCustomerDetails
            key={selectedCustomer.id}
            customerId={selectedCustomer.id}
            firstName={selectedCustomer.first_name}
            lastName={selectedCustomer.last_name}
            email={selectedCustomer.email}
            phone={selectedCustomer.phone}
            preferredContact={selectedCustomer.preferred_contact}
          />

          {/* ── Direct Action Buttons Suite ── */}
          <div className="p-3.5 rounded-xl bg-[#F5F0E8] border border-[#C9A96E]/50 space-y-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#2D4A32] block">
              ⚡ Quick Actions for {selectedCustomer.first_name}:
            </span>

            {/* The badge above says whether they have ever been written to.
                Until now there was nothing here to act on it with. */}
            {!selectedCustomer.registered && (
              <SendInviteButton
                email={selectedCustomer.email}
                firstName={selectedCustomer.first_name}
                lastName={selectedCustomer.last_name}
                alreadyInvited={!!selectedCustomer.invitedAt}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
              {/* 1. Open Invoice Generator pre-filled */}
              <a
                href={newInvoiceUrl(STORE_URL, {
                  name: formatCustomerName(selectedCustomer.first_name, selectedCustomer.last_name),
                  email: selectedCustomer.email,
                  phone: selectedCustomer.phone,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-[#2D4A32] text-white font-bold flex items-center justify-center gap-1.5 hover:bg-[#1A2E1C] shadow-xs text-center"
              >
                🧾 Open in Invoice Generator ↗
              </a>

              {/* 2. Book Creek Ready Tune-up ($100.00 with 20% Discount) */}
              <a
                href={`${STORE_URL}/repair-intake.html?service=tuneup&discount=20&promo=20OFF&member=1&firstName=${encodeURIComponent(selectedCustomer.first_name)}&lastName=${encodeURIComponent(
                  selectedCustomer.last_name && selectedCustomer.last_name.toLowerCase() !== '(none)'
                    ? selectedCustomer.last_name
                    : ''
                )}&phone=${encodeURIComponent(selectedCustomer.phone || '')}&email=${encodeURIComponent(
                  selectedCustomer.email || ''
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-[#C9A96E] text-[#1A2E1C] font-bold flex items-center justify-center gap-1.5 hover:bg-[#dbb978] shadow-xs text-center"
              >
                🌲 Book Tune-Up ($100.00) ↗
              </a>

              {/* 3. Call or Text via Google Voice */}
              {selectedCustomer.phone ? (
                <div className="flex gap-1">
                  <a
                    href={getGoogleVoiceUrls(selectedCustomer.phone).callUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Natively open Google Voice to Call"
                    className="flex-1 p-2 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2] shadow-2xs text-center"
                  >
                    📞 Call (Voice)
                  </a>
                  <a
                    href={getGoogleVoiceUrls(selectedCustomer.phone).textUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Natively open Google Voice to Text"
                    className="flex-1 p-2 rounded-lg bg-white border border-[#2D4A32] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2] shadow-2xs text-center"
                  >
                    💬 Text (Voice)
                  </a>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-gray-100 text-gray-400 font-semibold text-center">
                  📞 No phone on file
                </div>
              )}

              {/* 4. Open their portal as they see it */}
              <ViewAsButton
                customerId={selectedCustomer.id}
                firstName={selectedCustomer.first_name}
              />

              {/* 5. Referral link copy */}
              {selectedCustomer.referral_code ? (
                <button
                  type="button"
                  onClick={() => copyReferralLink(selectedCustomer.referral_code!)}
                  className="p-2.5 rounded-lg bg-white border border-[#C9A96E] text-[#2D4A32] font-bold flex items-center justify-center gap-1 hover:bg-[#FAF8F2]"
                >
                  {copiedCode ? '✅ Link Copied!' : `🎁 Copy Ref Link (${selectedCustomer.referral_code})`}
                </button>
              ) : (
                <div className="p-2.5 rounded-lg bg-gray-100 text-gray-400 font-semibold text-center">
                  🎁 No ref code
                </div>
              )}
            </div>
          </div>

          {/* Customer Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Phone</span>
              <span className="font-semibold text-[#1A1A1A]">{selectedCustomer.phone || '—'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Total Invoiced</span>
              <span className="font-bold text-[#2D4A32]">${selectedCustomer.totalSpent.toFixed(2)}</span>
              {!!selectedCustomer.totalOutstanding && (
                <span className="block text-[10px] font-semibold text-[#8A6D1F]">
                  ${selectedCustomer.totalOutstanding.toFixed(2)} not marked paid
                </span>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Invoices</span>
              <span className="font-semibold text-[#1A1A1A]">{selectedCustomer.invoiceCount}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Referral Code</span>
              <span className="font-mono font-bold text-[#2D4A32]">{selectedCustomer.referral_code || '—'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Email</span>
              <span className="font-semibold text-[#1A1A1A] break-all">{selectedCustomer.email || '—'}</span>
            </div>
            {/* Labelled for the state it is actually in. This tile always said
                "Invited" and printed formatWhen(null) — an em-dash — so beside
                a NOT INVITED badge it read "Invited: —", two answers to the
                same question on one screen. */}
            <div className="p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5]">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">
                {selectedCustomer.registered
                  ? 'Last Signed In'
                  : selectedCustomer.invitedAt
                    ? 'Invited'
                    : 'Portal Invite'}
              </span>
              <span
                className={`font-semibold ${
                  !selectedCustomer.registered && !selectedCustomer.invitedAt
                    ? 'text-[#9B2C2C]'
                    : 'text-[#1A1A1A]'
                }`}
              >
                {selectedCustomer.registered
                  ? formatWhen(selectedCustomer.lastSignInAt)
                  : selectedCustomer.invitedAt
                    ? `${formatWhen(selectedCustomer.invitedAt)} · never signed in`
                    : 'Never sent'}
              </span>
            </div>
          </div>

          {/* Customer Bikes List & Management */}
          <div className="pt-3 border-t border-gray-100 space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h4 className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">
                🚴 Registered Bikes, Serial & Receipt Numbers ({selectedCustomer.bikes.length}):
              </h4>
              <button
                type="button"
                onClick={() => setShowAddBike(!showAddBike)}
                className="text-xs font-bold text-[#2D4A32] bg-[#F5F0E8] border border-[#2D4A32]/20 px-2.5 py-1 rounded-lg hover:bg-[#FAF8F2] shadow-2xs transition-colors"
              >
                {showAddBike ? '✕ Cancel Add Bike' : '➕ Add Bike for Customer'}
              </button>
            </div>

            {/* Optional Add Bike Form */}
            {showAddBike && (
              <form action={adminAddBike} className="p-3.5 bg-white border-2 border-[#2D4A32] rounded-xl space-y-3 animate-fadeIn">
                <input type="hidden" name="customer_id" value={selectedCustomer.id} />
                <div className="text-xs font-bold uppercase tracking-wider text-[#2D4A32]">
                  Register Bike for {formatCustomerName(selectedCustomer.first_name, selectedCustomer.last_name)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Brand *</label>
                    {/* Mokwheel was missing, and Velotric sat first — so a
                        Mokwheel was silently registered as a Velotric. The
                        empty first option means the brand has to be chosen:
                        `required` then blocks the form instead of letting
                        whatever happens to be first stand in for an answer. */}
                    <select name="brand" required defaultValue="" className="w-full p-2 border border-[#C9A96E] rounded-lg bg-[#FAF8F2] font-semibold">
                      <option value="" disabled>Choose a brand…</option>
                      <option value="Heybike">Heybike</option>
                      <option value="Jasion">Jasion</option>
                      <option value="Mokwheel">Mokwheel</option>
                      <option value="Mooncool">Mooncool</option>
                      <option value="Velotric">Velotric</option>
                      <option value="other">Other (trade-in / not sold here)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Model *</label>
                    <input name="model" required placeholder="e.g. Discover 3" className="w-full p-2 border border-[#C9A96E] rounded-lg text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Serial #</label>
                    <input name="serial_number" placeholder="e.g. VT-987654" className="w-full p-2 border border-[#C9A96E] rounded-lg uppercase font-mono text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Receipt #</label>
                    <input name="receipt_number" placeholder="e.g. CTR-058" className="w-full p-2 border border-[#C9A96E] rounded-lg uppercase font-mono text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Purchase Date</label>
                    <input name="purchase_date" type="date" className="w-full p-2 border border-[#C9A96E] rounded-lg text-xs" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowAddBike(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 font-semibold">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary text-xs px-4 py-1.5 font-bold shadow-xs">
                    Save New Bike 🚴
                  </button>
                </div>
              </form>
            )}

            {selectedCustomer.bikes.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {selectedCustomer.bikes.map((b) => (
                  <BikeAdminCard key={b.id} bike={b} knownInvoiceNumbers={invoiceNumberSet} shopInvoiceByNumber={shopInvoiceMap} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic bg-[#FAF8F2] p-3 rounded-lg border border-dashed border-[#C9A96E]">
                No bikes registered for this customer yet. Use the "+ Add Bike for Customer" button above or generate an invoice with an e-bike.
              </p>
            )}
          </div>

          {/* ── Their invoices, with delete for test invoices and mistakes ── */}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <h4 className="text-xs font-bold text-[#4A4A4A] uppercase tracking-wider">
              🧾 Invoices ({selectedCustomer.invoices?.length || 0}):
            </h4>
            {selectedCustomer.invoices && selectedCustomer.invoices.length > 0 ? (
              <ul className="space-y-1.5">
                {selectedCustomer.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 rounded-lg bg-[#FAF8F2] border border-[#E5E5E5] text-xs"
                  >
                    <Link href={`/admin/invoices/${inv.id}`} className="font-mono font-bold text-[#2D4A32] hover:underline">
                      {inv.invoice_number || 'No number'}
                    </Link>
                    <span className="text-gray-500">
                      {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : ''}
                    </span>
                    <span className="font-semibold">${inv.total_amount.toFixed(2)}</span>
                    <span className="uppercase text-[10px] font-bold text-gray-500">{inv.status}</span>
                    <span className="ml-auto">
                      <DeleteInvoiceButton invoiceId={inv.id} invoiceNumber={inv.invoice_number || ''} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500 italic">
                No invoices in the portal. Invoices that are only in the Google Sheet can be deleted from the invoice
                generator: open the invoice there and use Delete invoice.
              </p>
            )}
          </div>

          {/* ── Removing them ── */}
          <div className="border-t border-[#E5E5E5] pt-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#9B2C2C] block mb-2">
              Remove {selectedCustomer.first_name}
            </span>
            <RemoveCustomer
              customerId={selectedCustomer.id}
              name={formatCustomerName(selectedCustomer.first_name, selectedCustomer.last_name)}
              archived={!!selectedCustomer.archived_at}
              isAdmin={selectedCustomer.is_admin}
            />
          </div>
        </div>
      )}

      {/* ── Bulk actions on the ticked rows ── */}
      <BulkActions
        selected={checkedCustomers}
        inArchive={showArchived}
        onDone={() => setChecked(new Set())}
      />

      {/* ── Desktop Table ── */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#F5F0E8] text-[#1A2E1C]">
            <tr>
              <th className="p-3.5 pr-0 border-b w-8">
                <input
                  type="checkbox"
                  aria-label="Tick everyone shown"
                  checked={allVisibleChecked}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 accent-[#2D4A32] cursor-pointer"
                />
              </th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Customer Name</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Phone</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Bikes Owned & Purchase Date</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Invoices</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Total Invoiced</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider">Ref Code</th>
              <th className="p-3.5 border-b font-semibold text-xs uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((c) => {
              const isSelected = selectedCustomerId === c.id
              const cleanName = formatCustomerName(c.first_name, c.last_name)
              return (
                <tr
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  className={`border-b last:border-0 transition-colors cursor-pointer ${
                    isSelected ? SELECTED_ROW : UNSELECTED_ROW
                  }`}
                >
                  <td className="p-3.5 pr-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Tick ${cleanName}`}
                      checked={checked.has(c.id)}
                      onChange={() => toggleChecked(c.id)}
                      className="h-4 w-4 accent-[#2D4A32] cursor-pointer"
                    />
                  </td>
                  <td className="p-3.5 font-bold text-sm text-[#1A2E1C]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{cleanName}</span>
                      {c.is_admin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C9A96E] font-bold text-[#1A2E1C]">
                          ADMIN
                        </span>
                      )}
                      <SignupBadge customer={c} />
                      {c.creekGuard && <CreekGuardBadge compact />}
                    </div>
                    <span className="block font-normal mt-0.5 space-x-2">
                      {c.email && <span className="text-[11px] text-gray-500">{c.email}</span>}
                      <SignupWhen customer={c} />
                    </span>
                  </td>
                  <td className="p-3.5 text-xs text-[#4A4A4A]">{c.phone || '—'}</td>
                  <td className="p-3.5">
                    {c.bikes.length > 0 ? (
                      <div className="space-y-1">
                        {c.bikes.map((b) => (
                          <div key={b.id} className="flex items-center gap-1.5 text-xs">
                            <span className="px-1.5 py-0.5 rounded bg-[#2D4A32]/10 text-[#2D4A32] text-[10px] font-bold uppercase">
                              {b.brand}
                            </span>
                            <span className="font-semibold text-[#1A1A1A]">{b.model}</span>
                            {b.purchase_date && (
                              <span className="text-gray-500 text-[11px]">
                                ({new Date(b.purchase_date).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3.5 text-xs font-semibold">{c.invoiceCount}</td>
                  <td className="p-3.5 text-xs font-bold text-[#2D4A32]">${c.totalSpent.toFixed(2)}</td>
                  <td className="p-3.5 font-mono text-xs text-gray-600">{c.referral_code || '—'}</td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        selectCustomer(c.id)
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-bold shadow-xs ${
                        isSelected ? SELECTED_BUTTON : UNSELECTED_BUTTON
                      }`}
                    >
                      {isSelected ? '✓ Viewing' : 'Select & Actions →'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="md:hidden space-y-2.5">
        {filteredCustomers.map((c) => {
          const isSelected = selectedCustomerId === c.id
          const cleanName = formatCustomerName(c.first_name, c.last_name)
          return (
            <div
              key={c.id}
              onClick={() => selectCustomer(c.id)}
              className={`p-3.5 rounded-xl border shadow-xs space-y-2 cursor-pointer transition-all ${
                isSelected ? SELECTED_CARD : UNSELECTED_CARD
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-base text-[#1A2E1C] flex items-center gap-1.5 flex-wrap">
                    <input
                      type="checkbox"
                      aria-label={`Tick ${cleanName}`}
                      checked={checked.has(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleChecked(c.id)}
                      className="h-4 w-4 accent-[#2D4A32]"
                    />
                    <span>{cleanName}</span>
                    {c.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C9A96E] font-bold text-[#1A2E1C]">
                        ADMIN
                      </span>
                    )}
                    <SignupBadge customer={c} />
                    {c.creekGuard && <CreekGuardBadge compact />}
                  </p>
                  <p className="text-xs text-[#4A4A4A]">{c.phone || 'No phone'}</p>
                  {c.email && <p className="text-[11px] text-gray-500 break-all">{c.email}</p>}
                  <p className="mt-0.5"><SignupWhen customer={c} /></p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#2D4A32]">${c.totalSpent.toFixed(2)}</span>
                  <p className="text-[11px] text-gray-500">
                    {c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Bikes with Purchase Date */}
              {c.bikes.length > 0 && (
                <div className="space-y-1 pt-1">
                  {c.bikes.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-xs bg-[#F5F0E8] p-1.5 rounded-md"
                    >
                      <span className="font-semibold text-[#1A2E1C]">
                        🚴 {b.brand} {b.model}
                      </span>
                      {b.purchase_date && (
                        <span className="text-[10px] text-gray-600 font-medium">
                          {new Date(b.purchase_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-[#F5F0E8] flex justify-between items-center text-xs text-[#4A4A4A]">
                <span className="font-mono text-[11px] bg-[#F5F0E8] px-2 py-0.5 rounded text-[#2D4A32]">
                  🎁 {c.referral_code || 'No code'}
                </span>
                <span className="text-[#2D4A32] font-bold text-xs">
                  {isSelected ? '✓ Active & Selected' : 'Tap for Actions & Invoice →'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
