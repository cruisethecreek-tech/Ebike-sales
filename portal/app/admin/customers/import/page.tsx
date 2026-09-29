import Link from 'next/link'
import { ImportClient } from './import-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Import customers — Cruise the Creek',
}

export default function ImportCustomersPage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1
          className="uppercase tracking-wide text-3xl text-[#1A2E1C]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.04em' }}
        >
          Import customers
        </h1>
        <p className="text-xs text-[#4A4A4A]">
          Bring past customers in from a CSV — the Wix shop, a spreadsheet, anywhere.{' '}
          <Link href="/admin/customers" className="underline">
            Back to the directory
          </Link>
        </p>
      </div>

      <ImportClient />
    </div>
  )
}
