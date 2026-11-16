import "server-only";
import { Resend } from "resend";
import { readServerSetting } from "@/lib/auth/send-password-reset-email";
import { devDeliveryToConsole, logDevDelivery } from "@/lib/dev/dev-delivery";
import { escapeHtml } from "@/lib/security/html";
import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";

const RESERVED_EMAIL = /@(?:[^@]+\.)?(?:invalid|test|example|localhost)$|@example\.(?:com|org|net)$/i;

/**
 * Confirmation after the account is gone (also a warning if someone else did it).
 * Deliberately not written to the e-mail log: that log would keep the address of an erased account.
 */
export async function sendGoodbyeEmail(to: string, firstName: string | null, deletedBusinesses: string[]) {
    if (devDeliveryToConsole()) { logDevDelivery("email", to, `account deleted, businesses=${deletedBusinesses.length}`); return; }
    const apiKey = readServerSetting("RESEND_API_KEY");
    const from = readServerSetting("RESEND_FROM_EMAIL");
    if (!apiKey || !from || RESERVED_EMAIL.test(to)) return;
    const businesses = deletedBusinesses.length
        ? `<p style="font-size:15px;line-height:1.6">მასთან ერთად წაიშალა ${deletedBusinesses.map(name => `„${escapeHtml(name)}“`).join(", ")} და მისი ყველა მონაცემი.</p>`
        : "";
    const { error } = await new Resend(apiKey).emails.send({
        from, to: [to], subject: "MARTEO - ანგარიში წაიშალა",
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1C2E">
    <h2>${firstName ? `${escapeHtml(firstName)}, ` : ""}თქვენი ანგარიში წაიშალა</h2>
    <p style="font-size:15px;line-height:1.6">MARTEO-ს ანგარიში და მისი პირადი მონაცემები სამუდამოდ წაიშალა. სარეზერვო ასლებიდან ისინი 7 დღეში წაიშლება.</p>
    ${businesses}
    <p style="font-size:15px;line-height:1.6">თუ ეს თქვენ არ გაგიკეთებიათ, მაშინვე მოგვწერეთ: ${escapeHtml(MARTEO_CONTACTS.email)}</p>
    <p style="font-size:15px;line-height:1.6">მადლობა, რომ მართეოთი სარგებლობდით.<br>მართეოს გუნდი</p>
  </div>`,
    });
    if (error) throw new Error("Goodbye email failed");
}
