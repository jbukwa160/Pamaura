import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / filesystem-heavy packages stay outside the server bundle.
  serverExternalPackages: ["better-sqlite3", "sharp", "liquidjs"],
  // The theme is read from disk at run time; ship it with standalone builds.
  outputFileTracingIncludes: { "/**": ["./theme/**/*"] },
  poweredByHeader: false,
  // admin picture uploads go through server actions (default limit 1 MB)
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  // The storefront answers Shopify-style URLs itself (no trailing-slash rewriting).
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/checkouts/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
