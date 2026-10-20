import { randomInt } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import {
    EMAIL_CHANGE_MAX_ATTEMPTS,
    EMAIL_CHANGE_RESEND_SECONDS,
    EmailChangeError,
    emailChangeFailure,
    emailChangeJson,
    hashEmailChangeCode,
    hashEmailChangeValue,
    readEmailChangeBody,
    readEmailChangeSession,
} from "@/lib/profile/email-change";
import { sendEmailChangeCode } from "@/lib/profile/send-email-change-code";

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readEmailChangeBody(request);

        if (
            typeof body.authorization !== "string" ||
            !/^[a-f0-9]{64}$/.test(body.authorization)
        ) {
            throw new EmailChangeError(
                "ჯერ დაადასტურე მიმდინარე პაროლი.",
                403,
            );
        }

        if (typeof body.newEmail !== "string") {
            throw new EmailChangeError(
                "მიუთითე ახალი ელფოსტა.",
                422,
            );
        }

        const newEmail = body.newEmail.trim().toLowerCase();

        if (
            newEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) ||
            /[\u0000-\u001f\u007f]/u.test(newEmail)
        ) {
            throw new EmailChangeError(
                "მიუთითე სწორი ელფოსტა.",
                422,
            );
        }

        if (typeof body.logoutOtherSessions !== "boolean") {
            throw new EmailChangeError(
                "აირჩიე, გსურს თუ არა სხვა მოწყობილობებიდან გამოსვლა.",
                422,
            );
        }

        const authorization = body.authorization;
        const logoutOtherSessions = body.logoutOtherSessions;
        const initial = await readEmailChangeSession(prisma);
        const code = randomInt(100000, 1000000).toString();

        const delivery = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${initial.user.id}
                    FOR UPDATE
                `;

                const current = await readEmailChangeSession(tx);
                const now = new Date();

                if (
                    current.user.id !== initial.user.id ||
                    current.sessionTokenHash !== initial.sessionTokenHash
                ) {
                    throw new EmailChangeError(
                        "სესია შეიცვალა. თავიდან გახსენი ფანჯარა.",
                        409,
                    );
                }

                const pending = await tx.emailChangeRequest.findUnique({
                    where: {
                        authorizationHash:
                            hashEmailChangeValue(authorization),
                    },
                });

                if (
                    !pending ||
                    pending.userId !== current.user.id ||
                    pending.sessionTokenHash !== current.sessionTokenHash ||
                    pending.usedAt !== null ||
                    pending.expiresAt <= now ||
                    pending.previousEmail !== current.user.email ||
                    pending.passwordFingerprint !==
                        hashEmailChangeValue(current.user.password)
                ) {
                    throw new EmailChangeError(
                        "დადასტურების ვადა ამოიწურა ან ანგარიშის მონაცემები შეიცვალა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (pending.attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) {
                    throw new EmailChangeError(
                        "კოდის მცდელობები ამოიწურა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (newEmail === current.user.email.toLowerCase()) {
                    throw new EmailChangeError(
                        "მიუთითე მიმდინარე მისამართისგან განსხვავებული ელფოსტა.",
                        422,
                    );
                }

                const existing = await tx.user.findUnique({
                    where: { email: newEmail },
                    select: { id: true },
                });

                if (existing) {
                    throw new EmailChangeError(
                        "ამ ელფოსტის გამოყენება შეუძლებელია. მიუთითე სხვა მისამართი.",
                        422,
                    );
                }

                // Cooldown applies across this user's requests.
                const lastDelivery = await tx.emailChangeRequest.findFirst({
                    where: {
                        userId: current.user.id,
                        lastSentAt: { not: null },
                    },
                    orderBy: { lastSentAt: "desc" },
                    select: { lastSentAt: true },
                });

                if (lastDelivery?.lastSentAt) {
                    const retryAfter = Math.ceil(
                        (
                            lastDelivery.lastSentAt.getTime() +
                            EMAIL_CHANGE_RESEND_SECONDS * 1000 -
                            now.getTime()
                        ) / 1000,
                    );

                    if (retryAfter > 0) {
                        throw new EmailChangeError(
                            "კოდის ხელახლა გაგზავნამდე ცოტა მოიცადე.",
                            429,
                            retryAfter,
                        );
                    }
                }

                await tx.emailChangeRequest.update({
                    where: { id: pending.id },
                    data: {
                        newEmail,
                        codeHash: hashEmailChangeCode(
                            authorization,
                            code,
                        ),
                        logoutOtherSessions,
                        lastSentAt: now,

                        // Resending does not reset failed attempts
                        // or extend the password authorization.
                    },
                });

                return {
                    expiresAt: pending.expiresAt,
                };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        try {
            await sendEmailChangeCode({
                to: newEmail,
                code,
                expiresAt: delivery.expiresAt,
            });
        } catch {
            return emailChangeJson(
                {
                    success: false,
                    codeRequested: true,
                    newEmail,
                    expiresAt: delivery.expiresAt.toISOString(),
                    retryAfter: EMAIL_CHANGE_RESEND_SECONDS,
                    message:
                        "კოდის გაგზავნა ვერ დადასტურდა. თუ წერილი მიიღე, გამოიყენე მიღებული კოდი; სხვა შემთხვევაში ხელახლა გაგზავნე.",
                },
                502,
                EMAIL_CHANGE_RESEND_SECONDS,
            );
        }

        return emailChangeJson({
            success: true,
            newEmail,
            expiresAt: delivery.expiresAt.toISOString(),
            retryAfter: EMAIL_CHANGE_RESEND_SECONDS,
        });
    } catch (cause: unknown) {
        return emailChangeFailure(cause);
    } finally {
        await prisma.$disconnect();
    }
}