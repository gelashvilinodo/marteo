import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { createPrismaClient } from "@/lib/prisma";
import {
    PHONE_CHANGE_LIFETIME_MS,
    PhoneChangeError,
    phoneChangeFailure,
    phoneChangeJson,
    hashPhoneChangeValue,
    readPhoneChangeBody,
    readPhoneChangeSession,
} from "@/lib/profile/phone-change";

const PASSWORD_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_PASSWORD_ATTEMPTS = 5;

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readPhoneChangeBody(request);

        if (
            typeof body.password !== "string" ||
            body.password.length === 0
        ) {
            throw new PhoneChangeError(
                "შეიყვანე მიმდინარე პაროლი.",
                422,
            );
        }

        const password = body.password;
        const initial = await readPhoneChangeSession(prisma);

        const authorization = randomBytes(32).toString("hex");
        const authorizationHash =
            hashPhoneChangeValue(authorization);

        // Count the attempt before checking the password.
        const attempt = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${initial.user.id}
                    FOR UPDATE
                `;

                const current = await readPhoneChangeSession(tx);
                const now = new Date();

                if (
                    current.user.id !== initial.user.id ||
                    current.sessionTokenHash !== initial.sessionTokenHash
                ) {
                    throw new PhoneChangeError(
                        "სესია შეიცვალა. თავიდან გახსენი ფანჯარა.",
                        409,
                    );
                }

                const windowStart = new Date(
                    now.getTime() - PASSWORD_ATTEMPT_WINDOW_MS,
                );

                const recent = await tx.phoneChangeRequest.findMany({
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

                    throw new PhoneChangeError(
                        "პაროლის შემოწმების მცდელობები ამოიწურა. ცოტა მოგვიანებით სცადე.",
                        429,
                        retryAfter,
                    );
                }

                const expiresAt = new Date(
                    now.getTime() + PHONE_CHANGE_LIFETIME_MS,
                );

                const record = await tx.phoneChangeRequest.create({
                    data: {
                        userId: current.user.id,
                        sessionTokenHash: current.sessionTokenHash,
                        authorizationHash,
                        passwordFingerprint:
                            hashPhoneChangeValue(current.user.password),
                        previousPhone: current.user.phone,
                        expiresAt,

                        // Activate only after a successful password check.
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
                    previousPhone: current.user.phone,
                };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        // Do not hold the database lock during bcrypt processing.
        const valid = await bcrypt.compare(
            password,
            attempt.passwordHash,
        );

        if (!valid) {
            throw new PhoneChangeError(
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

                const current = await readPhoneChangeSession(tx);
                const now = new Date();

                if (
                    current.user.id !== initial.user.id ||
                    current.sessionTokenHash !== initial.sessionTokenHash ||
                    current.user.password !== attempt.passwordHash ||
                    current.user.phone !== attempt.previousPhone ||
                    attempt.expiresAt <= now
                ) {
                    throw new PhoneChangeError(
                        "ანგარიშის მონაცემები შეიცვალა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                await tx.phoneChangeRequest.updateMany({
                    where: {
                        userId: current.user.id,
                        sessionTokenHash: current.sessionTokenHash,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                await tx.phoneChangeRequest.update({
                    where: { id: attempt.id },
                    data: { usedAt: null },
                });
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        return phoneChangeJson({
            success: true,
            authorization,
            expiresAt: attempt.expiresAt.toISOString(),
        });
    } catch (cause: unknown) {
        return phoneChangeFailure(cause);
    } finally {
        await prisma.$disconnect();
    }
}