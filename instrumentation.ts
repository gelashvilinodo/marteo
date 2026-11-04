import type { Instrumentation } from "next";

// Server errors go to the admin panel's error log (/admin/system).
// Production only: local development shares the database and would fill the log with dev noise.
const enabled = () => process.env.NODE_ENV === "production" || process.env.SYSTEM_ERRORS_LOCAL === "1";

const THROTTLE_MS = 30_000;
const MAX_PER_MINUTE = 60;
const recent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
let writing = 0;
let originalError: (...args: unknown[]) => void = () => undefined;

async function connectionString() {
    try {
        const { getCloudflareContext } = await import("@opennextjs/cloudflare");
        const url = getCloudflareContext().env.HYPERDRIVE?.connectionString;
        if (url) return url;
    } catch { /* Local Next.js server. */ }
    return process.env.DATABASE_URL ?? null;
}

async function keepAlive(task: Promise<unknown>) {
    try {
        const { getCloudflareContext } = await import("@opennextjs/cloudflare");
        getCloudflareContext().ctx.waitUntil(task);
    } catch { /* Not in a Worker request: the promise runs on its own. */ }
}

async function capture(source: string, message: string, route: string | null, original: (...args: unknown[]) => void) {
    if (!message || !enabled()) return;
    const { errorFingerprint, recordSystemError } = await import("./lib/system/system-errors.mjs");
    const now = Date.now();
    // The same error in a loop is written once per 30 s per server instance; a storm is capped.
    const key = errorFingerprint(source, message, route);
    if (now - (recent.get(key) ?? 0) < THROTTLE_MS) return;
    if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
    if (++windowCount > MAX_PER_MINUTE) return;
    recent.set(key, now);
    if (recent.size > 500) recent.clear();
    const url = await connectionString();
    if (!url) return;
    writing++;
    const task = recordSystemError(url, { source, message, route })
        .catch(() => original("System error log write failed"))
        .finally(() => { writing--; });
    await keepAlive(task);
    await task;
}

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { describeArgs } = await import("./lib/system/system-errors.mjs");
    const original = console.error.bind(console);
    originalError = original;
    // Every existing console.error("X failed", error.name) also lands in the log; nothing else changes.
    console.error = (...args: unknown[]) => {
        original(...args);
        if (writing > 5) return;
        void capture("server", describeArgs(args), null, original).catch(() => undefined);
    };
}

// Errors no route caught (a crashed page or handler), with the route that failed.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
    const { describeArgs } = await import("./lib/system/system-errors.mjs");
    const digest = typeof error === "object" && error !== null && "digest" in error ? ` digest ${String((error as { digest: unknown }).digest)}` : "";
    const message = `Unhandled ${context.routeType} error: ${describeArgs([error])}${digest}`;
    await capture("request", message, `${request.method} ${context.routePath}`, originalError).catch(() => undefined);
};
