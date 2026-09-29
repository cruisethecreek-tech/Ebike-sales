import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Ride photo uploads (app/dashboard/photos). The browser shrinks each
      // photo to well under this first; Vercel refuses bodies over 4.5 MB.
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
