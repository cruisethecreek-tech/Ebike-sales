import React from 'react';
import { Navbar } from '@/app/components/navbar';
import { Sidebar } from '@/app/components/sidebar';
import { SeasonalBanner } from '@/app/components/seasonal-banner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen flex-1">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <SeasonalBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
