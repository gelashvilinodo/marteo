import { hashEmailChangeValue } from "@/lib/profile/email-change";

type ResetRequestWithUser = {
    usedAt: Date | null;
    expiresAt: Date;
    email: string;
    passwordFingerprint: string;
    user: { status: string; emailVerifiedAt: Date | null; email: string; password: string };
};

// ბმული მოქმედებს, თუ გამოუყენებელია, ვადა არ გასვლია და ანგარიში (ელფოსტა, პაროლი) მას შემდეგ არ შეცვლილა.
// იყენებს confirm (პაროლის შეცვლა) და check (გვერდის გახსნისას შემოწმება).
export function isUsableResetRequest(pending: ResetRequestWithUser | null, now = new Date()): pending is ResetRequestWithUser {
    return Boolean(
        pending &&
        pending.usedAt === null &&
        pending.expiresAt > now &&
        pending.user.status === "ACTIVE" &&
        pending.user.emailVerifiedAt &&
        pending.email === pending.user.email &&
        pending.passwordFingerprint === hashEmailChangeValue(pending.user.password),
    );
}
