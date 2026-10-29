import { contentSecurityPolicy } from "./lib/security/content-security-policy.mjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    devIndicators: false,

    async headers() {
        return [{
            source: "/:path*",
            headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
                { key: "Referrer-Policy", value: "no-referrer" },
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                // Same-origin print frames remain available; external framing is blocked.
                // The Cloudflare entrypoint replaces the script baseline with
                // fresh nonces (dynamic HTML) or build hashes (static HTML).
                ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
            ],
        }, {
            source: "/:path*",
            // OpenNext copies configured response headers into the render request.
            // Do not overwrite the nonce-bearing CSP set by our trusted Worker.
            missing: [{ type: "header", key: "x-marteo-csp-render" }],
            headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy({ development: process.env.NODE_ENV !== "production", baseline: true }) }],
        }];
    },

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