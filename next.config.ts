import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  devIndicators: false,
  // Sin imágenes remotas ni optimización externa: todo local.
  images: { unoptimized: true },
  // En Netlify las funciones necesitan el binario de SQLite y las migraciones.
  outputFileTracingIncludes: {
    "/**/*": ["./drizzle/**/*", "./node_modules/better-sqlite3/build/Release/better_sqlite3.node"],
  },
};

export default nextConfig;
