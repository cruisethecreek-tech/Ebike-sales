import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SeasonalThemeProvider } from "@/app/components/seasonal-theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#2D4A32",
};

export const metadata: Metadata = {
  title: "Cruise the Creek · Creek Ready Customer Portal",
  description: "Your Adventure, Electrified. Manage bikes, invoices, referrals, and more.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Creek Ready Portal",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SeasonalThemeProvider>
          {children}
        </SeasonalThemeProvider>
      </body>
    </html>
  );
}

