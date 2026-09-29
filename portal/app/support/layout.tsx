import React from 'react'
import { Navbar } from '@/app/components/navbar'
import { Sidebar } from '@/app/components/sidebar'
import { SeasonalBanner } from '@/app/components/seasonal-banner'
import { signedInIsAdmin } from '@/lib/signed-in-admin'

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await signedInIsAdmin()
  return (
    <div className="flex flex-col min-h-screen flex-1">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isAdmin={isAdmin} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <SeasonalBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
