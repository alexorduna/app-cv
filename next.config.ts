import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  devIndicators: false,
  // Sin imágenes remotas ni optimización externa: todo local.
  images: { unoptimized: true },
};

export default nextConfig;
