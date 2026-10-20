import bcrypt from "bcryptjs";

import { createPrismaClient } from "@/lib/prisma";
import {
    EmailChangeError,
    emailChangeJson,
    hashEmailChangeValue,
    readEmailChangeBody,
    readEmailChangeSession,
} from "@/lib/profile/email-change";
import {
    PasswordSettingsError,
    validatePasswordChange,
} from "@/lib/profile/password-settings";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readEmailChangeBody(request);
        const input = validatePasswordChange(body);

        if (
            typeof body.clientRequestId !== "string" ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
                body.clientRequestId,
            )
        ) {
            throw new PasswordSettingsError(
                "მოთხოვნის იდენტიფიკატორი არასწორია. ხელახლა სცადე.",
                400,
            );
        }

        if (typeof body.logoutOtherSessions !== "boolean") {
            throw new PasswordSettingsError(
                "აირჩიე, გსურს თუ არა სხვა მოწყობილობებიდან გამოსვლა.",
            );
        }

        const clientRequestId = body.clientRequestId;
        const logoutOtherSessions = body.logoutOtherSessions;
        const initial = await readEmailChangeSession(prisma);

        const reservation = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${initial.user.id}
                    FOR UPDATE
                `;

                const current = await readEmailChangeSession(tx);

                if (
                    current.user.id !== initial.user.id ||
                    current.sessionTokenHash !== initial.sessionTokenHash
                ) {
                    throw new PasswordSettingsError(
                        "სესია შეიცვალა. თავიდან სცადე.",
                        409,
                    );
                }

                const existing = await tx.passwordChangeRequest.findUnique({
                    where: {
                        userId_clientRequestId: {
                            userId: current.user.id,
                            clientRequestId,
                        },
                    },
                });

                if (existing) {
                    if (
                        existing.sessionTokenHash !== current.sessionTokenHash ||
                        existing.logoutOtherSessions !== logoutOtherSessions
                    ) {
                        throw new PasswordSettingsError(
                            "მოთხოვნის მონაცემები შეიცვალა. ხელახლა სცადე.",
                            409,
                        );
                    }

                    if (!existing.completedAt || !existing.newPasswordHash) {
                        throw new PasswordSettingsError(
                            "წინა მოთხოვნა ჯერ მუშავდება ან არ დასრულდა. ცოტა მოიცადე და ხელახლა სცადე.",
                            409,
                        );
                    }

                    return {
                        fresh: false,
                        record: existing,
                        passwordHash: current.user.password,
                    };
                }

                const now = new Date();

                const recent = await tx.passwordChangeRequest.findMany({
                    where: {
                        userId: current.user.id,
                        createdAt: {
                            gt: new Date(now.getTime() - ATTEMPT_WINDOW_MS),
                        },
                    },
                    orderBy: { createdAt: "asc" },
                    take: MAX_ATTEMPTS,
                    select: { createdAt: true },
                });

                if (recent.length >= MAX_ATTEMPTS) {
                    const retryAfter = Math.max(
                        1,
                        Math.ceil(
                            (
                                recent[0].createdAt.getTime() +
                                ATTEMPT_WINDOW_MS -
                                now.getTime()
                            ) / 1000,
                        ),
                    );

                    throw new PasswordSettingsError(
                        "პაროლის შეცვლის მცდელობები ამოიწურა. ცოტა მოგვიანებით სცადე.",
                        429,
                        "form",
                        retryAfter,
                    );
                }

                const record = await tx.passwordChangeRequest.create({
                    data: {
                        userId: current.user.id,
                        clientRequestId,
                        sessionTokenHash: current.sessionTokenHash,
                        passwordFingerprint:
                            hashEmailChangeValue(current.user.password),
                        logoutOtherSessions,
                    },
                });

                return {
                    fresh: true,
                    record,
                    passwordHash: current.user.password,
                };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        if (!reservation.fresh) {
            const savedHash = reservation.record.newPasswordHash;

            if (
                !savedHash ||
                reservation.passwordHash !== savedHash ||
                !(await bcrypt.compare(input.newPassword, savedHash))
            ) {
                throw new PasswordSettingsError(
                    "მოთხოვნა აღარ შეესაბამება მიმდინარე მონაცემებს. ხელახლა სცადე.",
                    409,
                );
            }

            const current = await readEmailChangeSession(prisma);

            if (
                current.user.id !== initial.user.id ||
                current.sessionTokenHash !== initial.sessionTokenHash ||
                current.user.password !== savedHash
            ) {
                throw new PasswordSettingsError(
                    "ანგარიშის მონაცემები შეიცვალა. ხელახლა სცადე.",
                    409,
                );
            }

            const profile = await prisma.user.findUniqueOrThrow({
                where: { id: current.user.id },
                select: { updatedAt: true },
            });

            return emailChangeJson({
                success: true,
                updatedAt: profile.updatedAt.toISOString(),
                logoutOtherSessions,
            });
        }

        const currentPasswordValid = await bcrypt.compare(
            input.currentPassword,
            reservation.passwordHash,
        );

        if (!currentPasswordValid) {
            throw new PasswordSettingsError(
                "მიმდინარე პაროლი არასწორია.",
                422,
                "currentPassword",
            );
        }

        if (
            await bcrypt.compare(
                input.newPassword,
                reservation.passwordHash,
            )
        ) {
            throw new PasswordSettingsError(
                "ახალი პაროლი მიმდინარე პაროლისგან განსხვავებული უნდა იყოს.",
                422,
                "newPassword",
            );
        }

        const newPasswordHash = await bcrypt.hash(
            input.newPassword,
            12,
        );

        const profile = await prisma.$transaction(
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
                    current.user.password !== reservation.passwordHash ||
                    reservation.record.createdAt.getTime() +
                        ATTEMPT_WINDOW_MS <= now.getTime()
                ) {
                    throw new PasswordSettingsError(
                        "ანგარიშის მონაცემები შეიცვალა ან მოთხოვნის ვადა ამოიწურა. თავიდან სცადე.",
                        409,
                    );
                }

                const updated = await tx.user.update({
                    where: { id: current.user.id },
                    data: { password: newPasswordHash },
                    select: { updatedAt: true },
                });

                await tx.passwordChangeRequest.update({
                    where: { id: reservation.record.id },
                    data: {
                        newPasswordHash,
                        completedAt: now,
                    },
                });

                await tx.emailChangeRequest.updateMany({
                    where: {
                        userId: current.user.id,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                await tx.phoneChangeRequest.updateMany({
                    where: {
                        userId: current.user.id,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                if (logoutOtherSessions) {
                    await tx.session.deleteMany({
                        where: {
                            userId: current.user.id,
                            tokenHash: {
                                not: current.sessionTokenHash,
                            },
                        },
                    });
                }

                return updated;
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        return emailChangeJson({
            success: true,
            updatedAt: profile.updatedAt.toISOString(),
            logoutOtherSessions,
        });
    } catch (cause: unknown) {
        if (cause instanceof PasswordSettingsError) {
            return emailChangeJson(
                {
                    success: false,
                    message: cause.message,
                    field: cause.field,
                    retryAfter: cause.retryAfter,
                },
                cause.status,
                cause.retryAfter,
            );
        }

        if (cause instanceof EmailChangeError) {
            return emailChangeJson(
                {
                    success: false,
                    message: cause.message,
                    field: "form",
                },
                cause.status,
            );
        }

        console.error("Password change request failed");

        return emailChangeJson(
            {
                success: false,
                message:
                    "შენახვის შედეგი ვერ დადასტურდა. იგივე მონაცემებით ხელახლა სცადე.",
                field: "form",
            },
            500,
        );
    } finally {
        await prisma.$disconnect();
    }
}