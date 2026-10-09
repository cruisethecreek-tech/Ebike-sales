import React from 'react';
import { Navbar } from '@/app/components/navbar';
import { Sidebar } from '@/app/components/sidebar';
import { SeasonalBanner } from '@/app/components/seasonal-banner';
import { ViewingAsBanner } from '@/app/components/viewing-as-banner';
import { signedInIsAdmin } from '@/lib/signed-in-admin'
import { unreadTicketReplies } from '@/lib/ticket-alerts';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, supportBadge] = await Promise.all([signedInIsAdmin(), unreadTicketReplies()])
  return (
    <div className="flex flex-col min-h-screen flex-1">
      <Navbar supportBadge={supportBadge} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isAdmin={isAdmin} supportBadge={supportBadge} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {/* Above everything, on every dashboard page, for as long as the
              preview lasts. */}
          <ViewingAsBanner />
          <div className="max-w-7xl mx-auto">
            <SeasonalBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
