import type { NextConfig } from "next";


const nextConfig: NextConfig = {
  devIndicators: false,

  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "pg",
    "pg-cloudflare",
  ],

  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
    ],
  },
};

export default nextConfig;