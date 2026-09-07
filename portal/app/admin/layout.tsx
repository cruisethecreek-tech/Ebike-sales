import { createClient } from '@/lib/supabase/server'
import { STORE_URL } from '@/lib/constants'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NowViewingDock } from './now-viewing-dock'

const adminNav = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/customers', label: 'Customers', icon: '👥' },
  { href: '/admin/invoices', label: 'Invoices', icon: '🧾' },
  { href: '/admin/referrals', label: 'Referrals', icon: '🎁' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!customer?.is_admin) {
    redirect('/dashboard')
  }

  // Fetch all customers with bikes and invoices for the persistent Now Viewing search dock
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: bikes } = await supabase
    .from('bikes')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .order('issued_at', { ascending: false })

  const customersData = (customers || []).map((c) => ({
    ...c,
    bikes: (bikes || []).filter((b) => b.customer_id === c.id),
    invoices: (invoices || []).filter((i) => i.customer_id === c.id),
  }))

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col" style={{ backgroundColor: '#F5F0E8' }}>
      {/* ── Fixed Mobile Header (Full Viewport Width 100vw) ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 w-full z-40 shadow-md" style={{ backgroundColor: '#1A2E1C' }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#2D4A32]">
          <span
            className="text-lg font-bold tracking-wide uppercase text-[#C9A96E]"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            CTC Admin
          </span>
          <Link
            href="/dashboard"
            className="text-xs px-2.5 py-1 rounded bg-[#2D4A32] text-[#C9A96E] font-bold"
          >
            Portal →
          </Link>
        </div>
        <nav className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto no-scrollbar">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold text-[#F5F0E8] hover:bg-[#2D4A32] whitespace-nowrap"
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex flex-1 w-full max-w-full">
        {/* ── Desktop Sidebar ── */}
        <aside className="hidden lg:flex w-64 fixed inset-y-0 flex-col z-20" style={{ backgroundColor: '#1A2E1C' }}>
          <div className="p-6">
            <h2
              className="uppercase tracking-wide text-2xl"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em', color: '#C9A96E' }}
            >
              Admin Panel
            </h2>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-2.5 rounded-lg hover:bg-[#2D4A32] text-sm font-medium transition-colors"
                style={{ color: '#F5F0E8' }}
              >
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t" style={{ borderColor: '#2D4A32' }}>
            <Link
              href="/dashboard"
              className="block px-4 py-2 rounded-lg hover:bg-[#2D4A32] text-sm font-semibold"
              style={{ color: '#C9A96E' }}
            >
              Back to Portal &rarr;
            </Link>
          </div>
        </aside>

        {/* ── Main content area with padding for fixed mobile top header ── */}
        <main className="flex-1 lg:ml-64 pt-20 lg:pt-0 pb-28 min-h-screen w-full max-w-full overflow-x-hidden">
          <header className="hidden lg:flex bg-white px-8 py-4 border-b border-gray-200 shadow-sm items-center justify-between">
            <h1
              className="uppercase tracking-wide text-xl text-[#1A2E1C]"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
            >
              Admin Dashboard
            </h1>
            <a
              href={`${STORE_URL}/invoice.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1 font-bold shadow-xs"
            >
              ⚡ Open Invoice Generator ↗
            </a>
          </header>
          <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* ── Persistent 'Now Viewing' Bottom Search Dock ── */}
      <NowViewingDock customers={customersData} />
    </div>
  )
}
