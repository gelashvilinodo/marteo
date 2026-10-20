import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { createPrismaClient } from "@/lib/prisma";
import {
    EMAIL_CHANGE_LIFETIME_MS,
    EmailChangeError,
    emailChangeFailure,
    emailChangeJson,
    hashEmailChangeValue,
    readEmailChangeBody,
    readEmailChangeSession,
} from "@/lib/profile/email-change";

const PASSWORD_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_PASSWORD_ATTEMPTS = 5;

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readEmailChangeBody(request);

        if (
            typeof body.password !== "string" ||
            body.password.length === 0
        ) {
            throw new EmailChangeError(
                "შეიყვანე მიმდინარე პაროლი.",
                422,
            );
        }

        const password = body.password;
        const initial = await readEmailChangeSession(prisma);

        const authorization = randomBytes(32).toString("hex");
        const authorizationHash =
            hashEmailChangeValue(authorization);

        // Reserve the attempt before checking the password.
        // Failed checks must also count toward the limit.
        const attempt = await prisma.$transaction(
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

                const windowStart = new Date(
                    now.getTime() - PASSWORD_ATTEMPT_WINDOW_MS,
                );

                const recent = await tx.emailChangeRequest.findMany({
                    where: {
                        userId: current.user.id,
                        createdAt: { gt: windowStart },
                    },
                    orderBy: { createdAt: "asc" },
                    take: MAX_PASSWORD_ATTEMPTS,
                    select: { createdAt: true },
                });

                if (recent.length >= MAX_PASSWORD_ATTEMPTS) {
                    const retryAfter = Math.max(
                        1,
                        Math.ceil(
                            (
                                recent[0].createdAt.getTime() +
                                PASSWORD_ATTEMPT_WINDOW_MS -
                                now.getTime()
                            ) / 1000,
                        ),
                    );

                    throw new EmailChangeError(
                        "პაროლის შემოწმების მცდელობები ამოიწურა. ცოტა მოგვიანებით სცადე.",
                        429,
                        retryAfter,
                    );
                }

                const expiresAt = new Date(
                    now.getTime() + EMAIL_CHANGE_LIFETIME_MS,
                );

                const record = await tx.emailChangeRequest.create({
                    data: {
                        userId: current.user.id,
                        sessionTokenHash: current.sessionTokenHash,
                        authorizationHash,
                        passwordFingerprint:
                            hashEmailChangeValue(current.user.password),
                        previousEmail: current.user.email,
                        expiresAt,

                        // Inactive until the password is verified.
                        usedAt: now,
                    },
                    select: {
                        id: true,
                        expiresAt: true,
                    },
                });

                return {
                    ...record,
                    passwordHash: current.user.password,
                    previousEmail: current.user.email,
                };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        // Avoid holding the database lock during bcrypt processing.
        const valid = await bcrypt.compare(
            password,
            attempt.passwordHash,
        );

        if (!valid) {
            throw new EmailChangeError(
                "მიმდინარე პაროლი არასწორია.",
                422,
            );
        }

        await prisma.$transaction(
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
                    current.sessionTokenHash !== initial.sessionTokenHash ||
                    current.user.password !== attempt.passwordHash ||
                    current.user.email !== attempt.previousEmail ||
                    attempt.expiresAt <= now
                ) {
                    throw new EmailChangeError(
                        "ანგარიშის მონაცემები შეიცვალა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                // Replace previous authorizations from this session.
                await tx.emailChangeRequest.updateMany({
                    where: {
                        userId: current.user.id,
                        sessionTokenHash: current.sessionTokenHash,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                await tx.emailChangeRequest.update({
                    where: { id: attempt.id },
                    data: { usedAt: null },
                });
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        return emailChangeJson({
            success: true,
            authorization,
            expiresAt: attempt.expiresAt.toISOString(),
        });
    } catch (cause: unknown) {
        return emailChangeFailure(cause);
    } finally {
        await prisma.$disconnect();
    }
}