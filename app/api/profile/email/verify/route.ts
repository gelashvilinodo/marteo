import { timingSafeEqual } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
    EMAIL_CHANGE_MAX_ATTEMPTS,
    EmailChangeError,
    emailChangeFailure,
    emailChangeJson,
    hashEmailChangeCode,
    hashEmailChangeValue,
    readEmailChangeBody,
    readEmailChangeSession,
} from "@/lib/profile/email-change";

const profileSelect = {
    id: true,
    firstName: true,
    lastName: true,
    avatarUrl: true,
    email: true,
    phone: true,
    emailVerifiedAt: true,
    phoneVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

function hashesMatch(first: string, second: string): boolean {
    const left = Buffer.from(first, "hex");
    const right = Buffer.from(second, "hex");

    return (
        left.length === right.length &&
        timingSafeEqual(left, right)
    );
}

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

        if (
            typeof body.code !== "string" ||
            !/^\d{6}$/.test(body.code)
        ) {
            throw new EmailChangeError(
                "შეიყვანე ექვსნიშნა კოდი.",
                422,
            );
        }

        const authorization = body.authorization;
        const code = body.code;
        const initial = await readEmailChangeSession(prisma);

        const result = await prisma.$transaction(
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
                    !pending.newEmail ||
                    !pending.codeHash ||
                    pending.passwordFingerprint !==
                        hashEmailChangeValue(current.user.password)
                ) {
                    throw new EmailChangeError(
                        "მოთხოვნა აღარ მოქმედებს. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                const correctCode = hashesMatch(
                    pending.codeHash,
                    hashEmailChangeCode(authorization, code),
                );

                if (pending.usedAt) {
                    // A lost response can be retried without repeating
                    // the email change or deleting sessions again.
                    if (
                        correctCode &&
                        current.user.email === pending.newEmail
                    ) {
                        const profile = await tx.user.findUniqueOrThrow({
                            where: { id: current.user.id },
                            select: profileSelect,
                        });

                        return {
                            ok: true as const,
                            profile,
                            logoutOtherSessions:
                                pending.logoutOtherSessions,
                        };
                    }

                    throw new EmailChangeError(
                        "მოთხოვნა უკვე დასრულებულია ან გაუქმებულია. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (
                    pending.expiresAt <= now ||
                    pending.previousEmail !== current.user.email
                ) {
                    throw new EmailChangeError(
                        "კოდის ვადა ამოიწურა ან ანგარიშის მონაცემები შეიცვალა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (pending.attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) {
                    throw new EmailChangeError(
                        "კოდის მცდელობები ამოიწურა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (!correctCode) {
                    const attempts = pending.attempts + 1;

                    await tx.emailChangeRequest.update({
                        where: { id: pending.id },
                        data: { attempts },
                    });

                    const remaining =
                        EMAIL_CHANGE_MAX_ATTEMPTS - attempts;

                    // Return the failure so the counter is committed.
                    return {
                        ok: false as const,
                        status: remaining > 0 ? 422 : 409,
                        message:
                            remaining > 0
                                ? `კოდი არასწორია. დარჩენილია ${remaining} მცდელობა.`
                                : "კოდის მცდელობები ამოიწურა. თავიდან დაადასტურე პაროლი.",
                    };
                }

                const existing = await tx.user.findUnique({
                    where: { email: pending.newEmail },
                    select: { id: true },
                });

                if (existing && existing.id !== current.user.id) {
                    throw new EmailChangeError(
                        "ამ ელფოსტის გამოყენება შეუძლებელია. მიუთითე სხვა მისამართი.",
                        422,
                    );
                }

                const profile = await tx.user.update({
                    where: { id: current.user.id },
                    data: {
                        email: pending.newEmail,
                        emailVerifiedAt: now,
                    },
                    select: profileSelect,
                });

                await tx.emailChangeRequest.update({
                    where: { id: pending.id },
                    data: { usedAt: now },
                });

                // The previous email is no longer current,
                // so other pending changes must be invalidated.
                await tx.emailChangeRequest.updateMany({
                    where: {
                        userId: current.user.id,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                if (pending.logoutOtherSessions) {
                    await tx.session.deleteMany({
                        where: {
                            userId: current.user.id,
                            tokenHash: {
                                not: current.sessionTokenHash,
                            },
                        },
                    });
                }

                return {
                    ok: true as const,
                    profile,
                    logoutOtherSessions:
                        pending.logoutOtherSessions,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.ReadCommitted,
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        if (!result.ok) {
            return emailChangeJson(
                {
                    success: false,
                    message: result.message,
                },
                result.status,
            );
        }

        return emailChangeJson({
            success: true,
            logoutOtherSessions: result.logoutOtherSessions,
            profile: {
                ...result.profile,
                emailVerifiedAt:
                    result.profile.emailVerifiedAt?.toISOString() ??
                    null,
                phoneVerifiedAt:
                    result.profile.phoneVerifiedAt?.toISOString() ??
                    null,
                createdAt: result.profile.createdAt.toISOString(),
                updatedAt: result.profile.updatedAt.toISOString(),
            },
        });
    } catch (cause: unknown) {
        if (
            cause instanceof Prisma.PrismaClientKnownRequestError &&
            cause.code === "P2002"
        ) {
            return emailChangeJson(
                {
                    success: false,
                    message:
                        "ამ ელფოსტის გამოყენება შეუძლებელია. მიუთითე სხვა მისამართი.",
                },
                422,
            );
        }

        return emailChangeFailure(cause);
    } finally {
        await prisma.$disconnect();
    }
}