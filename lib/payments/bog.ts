import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// საქართველოს ბანკის ონლაინ გადახდები (Payment Manager): https://api.bog.ge/docs/en/payments/introduction
// BOG_ENV=production რეალურ გარემოს ირთავს, სხვა ნებისმიერ შემთხვევაში sandbox-ია.

type Setting = "BOG_CLIENT_ID" | "BOG_CLIENT_SECRET" | "BOG_ENV" | "BOG_CALLBACK_URL" | "APP_URL";

function setting(name: Setting) {
    try {
        const value = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    } catch { /* Local development. */ }
    return process.env[name]?.trim() ?? "";
}

export class BogError extends Error {
    constructor(message: string, public status = 0) {
        super(message);
        this.name = "BogError";
    }
}

function hosts() {
    return setting("BOG_ENV") === "production"
        ? { api: "https://api.bog.ge", auth: "https://oauth2.bog.ge" }
        : { api: "https://api-sandbox.bog.ge", auth: "https://oauth2-sandbox.bog.ge" };
}

export function bogConfigured() {
    return Boolean(setting("BOG_CLIENT_ID") && setting("BOG_CLIENT_SECRET"));
}

// ბანკი callback-ს მხოლოდ HTTPS მისამართზე აგზავნის. ლოკალურად BOG_CALLBACK_URL-ით (მაგ. tunnel) იცვლება.
export function bogCallbackUrl() {
    const custom = setting("BOG_CALLBACK_URL");
    if (custom) return custom;
    return new URL("/api/billing/bog/callback", setting("APP_URL") || "https://marteo.ge").toString();
}

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

async function token() {
    const id = setting("BOG_CLIENT_ID"), secret = setting("BOG_CLIENT_SECRET");
    if (!id || !secret) throw new BogError("BOG credentials are not configured");
    const { auth } = hosts();
    const key = `${auth}:${id}`;
    if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
    const response = await fetch(`${auth}/auth/realms/bog/protocol/openid-connect/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new BogError("BOG authentication failed", response.status);
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new BogError("BOG authentication returned no token");
    // expires_in წამებშია; დოკუმენტაციის მაგალითი არაზუსტია, ამიტომ მაქსიმუმ 10 წუთს ვინახავთ.
    const seconds = typeof body.expires_in === "number" && body.expires_in > 0 && body.expires_in < 86_400 ? body.expires_in : 600;
    cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.min(seconds, 600) * 1000, key };
    return body.access_token;
}

async function call<T>(method: string, path: string, options: { body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await token()}`, "Accept-Language": "ka" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const response = await fetch(`${hosts().api}${path}`, {
        method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) throw new BogError(`BOG ${method} ${path.split("/").slice(0, 4).join("/")} failed`, response.status);
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
}

export type BogOrderInput = {
    externalOrderId: string;
    amount: number;
    itemId: string;
    description: string;
    successUrl: string;
    failUrl: string;
    idempotencyKey: string;
};

// შეკვეთის შექმნა: მომხმარებელი redirect-ით ბანკის გვერდზე იხდის.
export async function createBogOrder(input: BogOrderInput) {
    const amount = Math.round(input.amount * 100) / 100;
    const body = await call<{ id: string; _links?: { redirect?: { href?: string } } }>("POST", "/payments/v1/ecommerce/orders", {
        idempotencyKey: input.idempotencyKey,
        body: {
            callback_url: bogCallbackUrl(),
            external_order_id: input.externalOrderId,
            capture: "automatic",
            ttl: 30,
            payment_method: ["card", "google_pay", "apple_pay"],
            purchase_units: {
                currency: "GEL",
                total_amount: amount,
                basket: [{ product_id: input.itemId, description: input.description, quantity: 1, unit_price: amount }],
            },
            redirect_urls: { success: input.successUrl, fail: input.failUrl },
        },
    });
    const redirect = body._links?.redirect?.href;
    if (!body.id || !redirect) throw new BogError("BOG order response is incomplete");
    return { orderId: body.id, redirectUrl: redirect };
}

// გადახდამდე: ბარათი ავტომატური ჩამოჭრისთვის შეინახება (მომხმარებლის მონაწილეობის გარეშე).
export async function saveCardForSubscription(orderId: string) {
    await call("PUT", `/payments/v1/orders/${encodeURIComponent(orderId)}/subscriptions`);
}

// შენახული ბარათიდან ჩამოჭრა. თანხა და დანარჩენი მონაცემები მშობელი შეკვეთიდან მოდის.
export async function chargeSavedCard(parentOrderId: string, externalOrderId: string, idempotencyKey: string) {
    const body = await call<{ id: string }>("POST", `/payments/v1/ecommerce/orders/${encodeURIComponent(parentOrderId)}/subscribe`, {
        idempotencyKey,
        body: { callback_url: bogCallbackUrl(), external_order_id: externalOrderId },
    });
    if (!body.id) throw new BogError("BOG subscription charge returned no order");
    return body.id;
}

export async function deleteSavedCard(orderId: string) {
    await call("DELETE", `/payments/v1/charges/card/${encodeURIComponent(orderId)}`);
}

export type BogReceipt = {
    order_id: string;
    external_order_id?: string;
    order_status?: { key?: string };
    purchase_units?: { request_amount?: string; transfer_amount?: string; currency_code?: string };
    payment_detail?: { transfer_method?: { key?: string }; payer_identifier?: string; payment_option?: string; code?: string; code_description?: string };
};

export function getBogReceipt(orderId: string) {
    return call<BogReceipt>("GET", `/payments/v1/receipt/${encodeURIComponent(orderId)}`);
}

// callback-ის ხელმოწერა (SHA256withRSA) ბანკის საჯარო გასაღებით, ტექსტზე, სანამ JSON-ად წავიკითხავთ.
const BOG_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh"
    + "zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q"
    + "1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr"
    + "TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx"
    + "tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g"
    + "4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn"
    + "PwIDAQAB";

let publicKey: Promise<CryptoKey> | null = null;

export async function verifyBogSignature(rawBody: string, signature: string | null) {
    if (!signature) return false;
    publicKey ??= crypto.subtle.importKey(
        "spki", Buffer.from(BOG_PUBLIC_KEY, "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    try {
        return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", await publicKey, Buffer.from(signature, "base64"), new TextEncoder().encode(rawBody));
    } catch {
        return false;
    }
}
