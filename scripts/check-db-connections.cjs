// Read-only credential checks. No URLs, passwords, or database rows are logged.
const { Client } = require("pg");
const fs = require("node:fs");
const dotenv = require("dotenv");

// Cloudflare provides this build-only secret. Local Next builds need no DB
// connection, so leave their behavior unchanged when it is absent.
if (process.argv.includes("--build") && !process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE) {
    console.log("Database build checks skipped outside the configured Cloudflare build environment.");
    process.exit(0);
}

if (process.argv.includes("--local") && fs.existsSync(".env.local")) {
    const local = dotenv.parse(fs.readFileSync(".env.local"));
    for (const [key, value] of Object.entries(local)) {
        if (process.env[key] === undefined) process.env[key] = value;
    }
}

(async () => {
    const keys = ["DIRECT_URL", "DATABASE_URL", "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE"];
    let failed = false;
    for (const key of keys) {
        if (!process.env[key]) {
            const required = key !== keys[2] || process.argv.includes("--require-hyperdrive") || process.argv.includes("--build");
            console.log(`${key}: ${required ? "MISSING" : "NOT CONFIGURED (local optional)"}`);
            failed ||= required;
            continue;
        }
        const client = new Client({ connectionString: process.env[key], connectionTimeoutMillis: 10000, query_timeout: 10000 });
        try {
            await client.connect();
            await client.query("SELECT 1");
            console.log(`${key}: OK`);
        } catch (error) {
            // pg error messages can contain host names; log an allowlisted code only.
            const code = typeof error.code === "string" && /^[A-Z0-9_]{2,32}$/.test(error.code) ? error.code : "CONNECTION_FAILED";
            console.log(`${key}: FAILED (${code})`);
            failed = true;
        } finally { await client.end().catch(() => {}); }
    }
    process.exitCode = failed ? 1 : 0;
})().catch(() => { console.error("Database connection check failed"); process.exitCode = 1; });
