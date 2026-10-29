import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { PrismaClient } from "@/generated/prisma/client";
import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";
import { createPrismaClient } from "@/lib/prisma";

// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) on WebCrypto only, so it runs
// unchanged in Node and in the Cloudflare Worker runtime.

type PushSetting = "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT";

function readSetting(name: PushSetting) {
    try {
        const value = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    } catch { /* Local development. */ }
    return process.env[name]?.trim() ?? "";
}

export function getVapidPublicKey() {
    return readSetting("VAPID_PUBLIC_KEY") || null;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function concat(...parts: Uint8Array[]) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
    return result;
}

async function hmac(key: Uint8Array, data: Uint8Array) {
    const imported = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", imported, data as BufferSource));
}

async function vapidAuthorization(endpoint: string) {
    const publicKey = readSetting("VAPID_PUBLIC_KEY");
    const privateKey = readSetting("VAPID_PRIVATE_KEY");
    const subject = readSetting("VAPID_SUBJECT") || `mailto:${MARTEO_CONTACTS.email}`;
    if (!publicKey || !privateKey) return null;
    const raw = fromBase64Url(publicKey);
    const key = await crypto.subtle.importKey("jwk", {
        kty: "EC", crv: "P-256", d: privateKey,
        x: toBase64Url(raw.slice(1, 33)), y: toBase64Url(raw.slice(33, 65)),
    }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const claims = toBase64Url(encoder.encode(JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
    })));
    const signature = new Uint8Array(await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`),
    ));
    return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${publicKey}`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string) {
    const receiverPublic = fromBase64Url(p256dh);
    const authSecret = fromBase64Url(auth);
    const receiverKey = await crypto.subtle.importKey("raw", receiverPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    const localPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey) as ArrayBuffer);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, local.privateKey, 256));

    const keyInfo = concat(encoder.encode("WebPush: info\0"), receiverPublic, localPublic);
    const ikm = await hmac(await hmac(authSecret, shared), concat(keyInfo, new Uint8Array([1])));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const prk = await hmac(salt, ikm);
    const contentKey = (await hmac(prk, encoder.encode("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
    const nonce = (await hmac(prk, encoder.encode("Content-Encoding: nonce\0\x01"))).slice(0, 12);

    const aesKey = await crypto.subtle.importKey("raw", contentKey as BufferSource, "AES-GCM", false, ["encrypt"]);
    const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource));

    const recordSize = new Uint8Array([0, 0, 16, 0]);
    return concat(salt, recordSize, new Uint8Array([localPublic.byteLength]), localPublic, ciphertext);
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

async function sendOne(subscription: { endpoint: string; p256dh: string; auth: string }, message: PushMessage) {
    const authorization = await vapidAuthorization(subscription.endpoint);
    if (!authorization) return "unconfigured" as const;
    const response = await fetch(subscription.endpoint, {
        method: "POST",
        headers: {
            Authorization: authorization,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: "86400",
            Urgency: "high",
        },
        body: await encryptPayload(JSON.stringify(message), subscription.p256dh, subscription.auth) as BodyInit,
    });
    if (response.status === 404 || response.status === 410) return "gone" as const;
    if (!response.ok) {
        console.error("Web push rejected", response.status, await response.text().catch(() => ""));
        return "rejected" as const;
    }
    return "sent" as const;
}

export type PushDelivery = { devices: number; sent: number; removed: number; failed: number };

export async function sendPushToUsers(prisma: PrismaClient, userIds: string[], message: PushMessage): Promise<PushDelivery> {
    if (!userIds.length) return { devices: 0, sent: 0, removed: 0, failed: 0 };
    const subscriptions = await prisma.webPushSubscription.findMany({
        where: { userId: { in: userIds } },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    const results = await Promise.allSettled(subscriptions.map(subscription => sendOne(subscription, message)));
    const outcome = (index: number) => {
        const result = results[index];
        return result.status === "fulfilled" ? result.value : "failed";
    };
    const gone = subscriptions.filter((_, index) => outcome(index) === "gone").map(subscription => subscription.id);
    if (gone.length) await prisma.webPushSubscription.deleteMany({ where: { id: { in: gone } } });
    return {
        devices: subscriptions.length,
        sent: results.filter((_, index) => outcome(index) === "sent").length,
        removed: gone.length,
        failed: results.filter((_, index) => ["failed", "rejected", "unconfigured"].includes(outcome(index))).length,
    };
}

// The platform owner's devices; the sender never notifies themselves.
export async function notifyPlatformAdmin(prisma: PrismaClient, message: PushMessage, exceptUserId?: string) {
    // A notification must never fail the request that triggered it.
    const admin = await prisma.user.findFirst({ where: { isPlatformAdmin: true, status: "ACTIVE" }, select: { id: true } }).catch(() => null);
    if (!admin || admin.id === exceptUserId) return;
    const pushClient = createPrismaClient();
    await runInBackground(sendPushToUsers(pushClient, [admin.id], message).finally(() => pushClient.$disconnect()));
}

// Keep the HTTP response fast: on Cloudflare the push continues after it.
export function runInBackground(task: Promise<unknown>) {
    const safe = task.catch(() => console.error("Background push failed"));
    try {
        getCloudflareContext().ctx.waitUntil(safe);
        return Promise.resolve();
    } catch {
        return safe;
    }
}

export function isPushEndpoint(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 1024) return false;
    try {
        const url = new URL(value);
        // Only browser push services; the server must never POST to arbitrary hosts.
        const known = ["web.push.apple.com", "fcm.googleapis.com", "updates.push.services.mozilla.com"]
            .some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
            || url.hostname.endsWith(".notify.windows.com");
        return url.protocol === "https:" && !url.username && !url.password && !url.port && known;
    } catch { return false; }
}

export function isPushKey(value: unknown, bytes: number): value is string {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
    try { return fromBase64Url(value.replace(/=+$/, "")).byteLength === bytes; } catch { return false; }
}
