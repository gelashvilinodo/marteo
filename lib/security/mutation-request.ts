import { NextResponse } from "next/server";

// Check before parsing bodies, querying accounts or sending verification messages.
export function guardMutation(
    handler: (request: Request) => Promise<Response>,
    kind: "json" | "multipart" | "empty" = "json",
) {
    return async (request: Request): Promise<Response> => {
        const reject = (status: number, error: string) => NextResponse.json({ error }, { status });
        const origin = request.headers.get("origin");
        const site = request.headers.get("sec-fetch-site");
        // Next's Node adapter may normalize request.url to localhost even when
        // the browser addressed 127.0.0.1. Host is browser-controlled by the URL,
        // unlike arbitrary X-Forwarded-Host values, which we deliberately ignore.
        const target = new URL(request.url);
        const host = request.headers.get("host");
        if (host) {
            try {
                const addressed = new URL(`${target.protocol}//${host}`);
                if (addressed.username || addressed.password || addressed.host !== host.toLowerCase()) {
                    return reject(403, "მოთხოვნის წყარო დაუშვებელია.");
                }
                target.host = addressed.host;
            } catch { return reject(403, "მოთხოვნის წყარო დაუშვებელია."); }
        }
        if (site === "cross-site" || origin !== target.origin) {
            return reject(403, "მოთხოვნის წყარო დაუშვებელია.");
        }
        if (kind === "empty") return handler(request);
        const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
        if (type !== (kind === "json" ? "application/json" : "multipart/form-data")) {
            return reject(415, "მოთხოვნის ფორმატი დაუშვებელია.");
        }
        const limit = kind === "json" ? 64 * 1024 : 3 * 1024 * 1024;
        const length = request.headers.get("content-length");
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
            return reject(413, "მოთხოვნის ზომა დასაშვებ ზღვარს აღემატება.");
        }
        const reader = request.body?.getReader();
        if (!reader) return reject(400, "მოთხოვნის მონაცემები არასწორია.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > limit) {
                    await reader.cancel();
                    return reject(413, "მოთხოვნის ზომა დასაშვებ ზღვარს აღემატება.");
                }
                chunks.push(value);
            }
        } catch {
            return reject(400, "მოთხოვნის წაკითხვა ვერ მოხერხდა.");
        } finally {
            reader.releaseLock();
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        if (kind === "json") {
            try {
                const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
            } catch {
                return reject(400, "მოთხოვნის მონაცემები არასწორია.");
            }
        }
        return handler(new Request(request.url, { method: request.method, headers: request.headers, body }));
    };
}
