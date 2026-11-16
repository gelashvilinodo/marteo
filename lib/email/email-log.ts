import "server-only";
import { reserveDelivery } from "@/lib/security/delivery-limit";
import { createPrismaClient } from "@/lib/prisma";

export type EmailKind = "verification" | "password-reset" | "email-change" | "team-invite" | "notice";

// შეცდომიდან მხოლოდ ტიპი (მაგ. validation_error), არასდროს ტექსტი.
function errorName(error: unknown) {
    if (error && typeof error === "object" && "name" in error && typeof error.name === "string" && /^[\w.-]{1,60}$/.test(error.name)) return error.name;
    return "UnknownError";
}

/** One row per attempt. Logging must never break or slow down sending, so failures are swallowed. */
export async function logEmail(kind: EmailKind, to: string, status: "SENT" | "FAILED" | "LIMITED", providerId: string | null = null, error: string | null = null) {
    const prisma = createPrismaClient();
    try {
        await prisma.emailLog.create({ data: { kind, recipient: to.trim().toLowerCase().slice(0, 254), status, providerId, error } });
    } catch {
        console.error("Email log write failed");
    } finally { await prisma.$disconnect().catch(() => undefined); }
}

/** Our own per-recipient and daily limits; a refusal is logged so support can see why nothing arrived. */
export async function reserveEmail(kind: EmailKind, to: string) {
    try {
        await reserveDelivery("email", to.trim().toLowerCase());
    } catch (error) {
        await logEmail(kind, to, "LIMITED", null, errorName(error));
        throw error;
    }
}

type ResendResult = { data?: { id?: string } | null; error?: { name?: string; message?: string } | null };

/** Wraps resend.emails.send: logs SENT with Resend's id, or FAILED with the error type, and returns the result. */
export async function sendTracked<T extends ResendResult>(kind: EmailKind, to: string, send: () => Promise<T>): Promise<T> {
    let result: T;
    try {
        result = await send();
    } catch (error) {
        await logEmail(kind, to, "FAILED", null, errorName(error));
        throw error;
    }
    if (result.error) await logEmail(kind, to, "FAILED", null, errorName(result.error));
    else await logEmail(kind, to, "SENT", result.data?.id ?? null);
    return result;
}
