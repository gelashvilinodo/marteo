import "server-only";

import { Resend } from "resend";

export async function sendEmailChangeCode({
    to,
    code,
    expiresAt,
}: {
    to: string;
    code: string;
    expiresAt: Date;
}) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
        throw new Error("Missing email server configuration");
    }

    const expiry = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Tbilisi",
    }).format(expiresAt);

    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
        from,
        to: [to],
        subject: "MARTEO — ელფოსტის შეცვლის დადასტურება",
        text: [
            "MARTEO ანგარიშის ელფოსტის შეცვლის კოდი:",
            code,
            `კოდის მოქმედების ვადა: ${expiry} — თბილისის დროით.`,
            "თუ ელფოსტის შეცვლა არ მოგითხოვია, უგულებელყავი ეს წერილი.",
        ].join("\n\n"),
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
                <h2>ელფოსტის შეცვლა</h2>
                <p>ახალი ელფოსტის დასადასტურებლად ჩაწერე ეს კოდი MARTEO-ში:</p>
                <div style="margin:24px 0;padding:20px;background:#0f1c2e;color:#fff;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;border-radius:12px">
                    ${code}
                </div>
                <p>კოდის მოქმედების ვადა: ${expiry} — თბილისის დროით.</p>
                <p>თუ ელფოსტის შეცვლა არ მოგითხოვია, უგულებელყავი ეს წერილი.</p>
            </div>
        `,
    });

    if (error) {
        throw new Error("Email change delivery failed");
    }
}