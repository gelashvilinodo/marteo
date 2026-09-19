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

    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "uwxmbyweyvnekzzecroz.supabase.co",
                pathname: "/storage/v1/object/public/**",
            },
        ],
    },
};

export default nextConfig;