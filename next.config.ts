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

    // Build-time Prisma tools are not the generated application query compiler.
    // Keep .next/server/chunks/** and generated/prisma/** available at runtime.
    outputFileTracingExcludes: {
        "/*": [
            "./node_modules/prisma/build/*.wasm",
            "./node_modules/@prisma/dev/dist/runtime-assets/*.wasm",
            "./node_modules/@electric-sql/pglite/dist/*.wasm",
            "./node_modules/@electric-sql/pglite-tools/dist/*.wasm",
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