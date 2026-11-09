import { NextResponse } from "next/server";

import { createPrismaClient } from "@/lib/prisma";
import { isUsableResetRequest } from "@/lib/auth/password-reset-link";
import { hashEmailChangeValue, readEmailChangeBody } from "@/lib/profile/email-change";

// აღდგენის გვერდი გახსნისთანავე ამოწმებს, ჯერ კიდევ მოქმედებს თუ არა ბმული,
// რომ მომხმარებელმა ახალი პაროლი ტყუილად არ აკრიფოს. ტოკენი body-ში მოდის და არა მისამართში.
export async function POST(request: Request) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    const reply = (valid: boolean) => NextResponse.json({ valid }, { headers: { "Cache-Control": "private, no-store" } });
    try {
        const body = await readEmailChangeBody(request);
        if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) return reply(false);
        prisma = createPrismaClient();
        const pending = await prisma.passwordResetRequest.findUnique({
            where: { tokenHash: hashEmailChangeValue(body.token) },
            select: {
                usedAt: true, expiresAt: true, email: true, passwordFingerprint: true,
                user: { select: { status: true, emailVerifiedAt: true, email: true, password: true } },
            },
        });
        return reply(isUsableResetRequest(pending));
    } catch {
        // შემოწმება ვერ მოხერხდა: ფორმა ჩვეულებრივ რჩება, საბოლოო შემოწმებას confirm აკეთებს.
        return NextResponse.json({ valid: null }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    } finally {
        await prisma?.$disconnect();
    }
}
