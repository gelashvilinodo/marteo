import { reserveDelivery } from "@/lib/security/delivery-limit";
import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Resend } from "resend";

export const PASSWORD_RESET_LIFETIME_MS = 15 * 60 * 1000;

function readServerSetting(
    name: "APP_URL" | "RESEND_API_KEY" | "RESEND_FROM_EMAIL",
): string {
    try {
        const { env } = getCloudflareContext();
        const value = (
            env as unknown as Record<string, unknown>
        )[name];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    } catch {
        // Local development.
    }

    return process.env[name]?.trim() ?? "";
}

function getAppOrigin(): string {
    // Local tests must open the local reset page.
    const configured = process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : readServerSetting("APP_URL");

    if (!configured) {
        throw new Error("Missing APP_URL configuration");
    }

    const url = new URL(configured);
    const localHost = [
        "localhost",
        "127.0.0.1",
        "[::1]",
    ].includes(url.hostname);

    if (
        url.username ||
        url.password ||
        (
            url.protocol !== "https:" &&
            !(url.protocol === "http:" && localHost)
        )
    ) {
        throw new Error("Invalid APP_URL configuration");
    }

    return url.origin;
}

export async function sendPasswordResetEmail({
    to,
    token,
}: {
    to: string;
    token: string;
}): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(token)) {
        throw new Error("Invalid password reset token");
    }

    const apiKey = readServerSetting("RESEND_API_KEY");
    const from = readServerSetting("RESEND_FROM_EMAIL");

    if (!apiKey || !from) {
        throw new Error("Missing email server configuration");
    }

    const url = new URL("/reset-password", getAppOrigin());

    // The fragment is read by the reset form.
    // It is not sent in the page's HTTP request.
    url.hash = new URLSearchParams({ token }).toString();

    const resetLink = url.toString();
    await reserveDelivery("email", to.trim().toLowerCase());

    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
        from,
        to: [to],
        subject: "MARTEO - პაროლის აღდგენა",
        text: [
            "MARTEO ანგარიშის პაროლის აღსადგენად გახსენი ბმული:",
            resetLink,
            "ბმული მოქმედებს 15 წუთის განმავლობაში და ერთჯერადია.",
            "თუ პაროლის აღდგენა არ მოგითხოვია, უგულებელყავი ეს წერილი.",
        ].join("\n\n"),
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
                <h2>პაროლის აღდგენა</h2>
                <p>ახალი პაროლის შესაქმნელად დააჭირე ღილაკს:</p>

                <a
                    href="${resetLink}"
                    style="display:inline-block;margin:16px 0;padding:14px 22px;background:#16c45b;color:#081f16;text-decoration:none;font-weight:700;border-radius:12px"
                >
                    პაროლის აღდგენა
                </a>

                <p>ბმული მოქმედებს 15 წუთის განმავლობაში და ერთჯერადია.</p>
                <p>თუ პაროლის აღდგენა არ მოგითხოვია, უგულებელყავი ეს წერილი.</p>
                <p>MARTEO.GE</p>
            </div>
        `,
    });

    if (error) {
        throw new Error("Password reset email delivery failed");
    }
}