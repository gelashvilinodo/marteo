import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,

  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
    ],
  },
};

export default nextConfig;