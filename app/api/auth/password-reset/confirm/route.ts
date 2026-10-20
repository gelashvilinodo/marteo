import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createPrismaClient } from "@/lib/prisma";
import {
    EmailChangeError,
    emailChangeJson,
    hashEmailChangeValue,
    readEmailChangeBody,
} from "@/lib/profile/email-change";
import {
    PasswordSettingsError,
    validateNewPassword,
} from "@/lib/profile/password-settings";

function invalidLink(): never {
    throw new PasswordSettingsError(
        "ბმული აღარ მოქმედებს. მოითხოვე პაროლის აღდგენის ახალი ბმული.",
        410,
        "form",
    );
}

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readEmailChangeBody(request);

        if (
            typeof body.token !== "string" ||
            !/^[a-f0-9]{64}$/.test(body.token)
        ) {
            invalidLink();
        }

        const tokenHash = hashEmailChangeValue(body.token);
        const newPassword = validateNewPassword(body.newPassword);

        if (
            typeof body.confirmPassword !== "string" ||
            body.confirmPassword !== newPassword
        ) {
            throw new PasswordSettingsError(
                "პაროლები არ ემთხვევა.",
                422,
                "confirmPassword",
            );
        }

        const pending = await prisma.passwordResetRequest.findUnique({
            where: { tokenHash },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        password: true,
                        status: true,
                        emailVerifiedAt: true,
                    },
                },
            },
        });

        if (
            !pending ||
            pending.usedAt !== null ||
            pending.expiresAt <= new Date() ||
            pending.user.status !== "ACTIVE" ||
            !pending.user.emailVerifiedAt ||
            pending.email !== pending.user.email ||
            pending.passwordFingerprint !==
                hashEmailChangeValue(pending.user.password)
        ) {
            invalidLink();
        }

        if (await bcrypt.compare(newPassword, pending.user.password)) {
            throw new PasswordSettingsError(
                "ახალი პაროლი ძველი პაროლისგან განსხვავებული უნდა იყოს.",
                422,
                "newPassword",
            );
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        const cookieStore = await cookies();
        const rawSession = cookieStore.get("marteo_session")?.value;
        const currentSessionHash = rawSession
            ? hashEmailChangeValue(rawSession)
            : null;

        const result = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${pending.userId}
                    FOR UPDATE
                `;

                const latest = await tx.passwordResetRequest.findUnique({
                    where: { tokenHash },
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                password: true,
                                status: true,
                                emailVerifiedAt: true,
                            },
                        },
                    },
                });

                const now = new Date();

                if (
                    !latest ||
                    latest.usedAt !== null ||
                    latest.expiresAt <= now ||
                    latest.user.status !== "ACTIVE" ||
                    !latest.user.emailVerifiedAt ||
                    latest.email !== latest.user.email ||
                    latest.passwordFingerprint !==
                        hashEmailChangeValue(latest.user.password) ||
                    latest.user.password !== pending.user.password
                ) {
                    invalidLink();
                }

                let clearCurrentCookie = false;

                if (currentSessionHash) {
                    const session = await tx.session.findUnique({
                        where: { tokenHash: currentSessionHash },
                        select: { userId: true },
                    });

                    clearCurrentCookie =
                        session?.userId === latest.userId;
                }

                await tx.user.update({
                    where: { id: latest.userId },
                    data: { password: newPasswordHash },
                });

                // Consume this link and invalidate other reset links.
                await tx.passwordResetRequest.updateMany({
                    where: {
                        userId: latest.userId,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                await tx.emailChangeRequest.updateMany({
                    where: {
                        userId: latest.userId,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                await tx.phoneChangeRequest.updateMany({
                    where: {
                        userId: latest.userId,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                // Password recovery always signs out every device.
                await tx.session.deleteMany({
                    where: { userId: latest.userId },
                });

                return { clearCurrentCookie };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        const response = NextResponse.json(
            {
                success: true,
                message:
                    "პაროლი წარმატებით შეიცვალა. შედი ახალი პაროლით.",
            },
            {
                headers: {
                    "Cache-Control": "private, no-store",
                },
            },
        );

        if (result.clearCurrentCookie) {
            response.cookies.delete("marteo_session");
        }

        return response;
    } catch (cause: unknown) {
        if (cause instanceof PasswordSettingsError) {
            return emailChangeJson(
                {
                    success: false,
                    message: cause.message,
                    field: cause.field,
                },
                cause.status,
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

        console.error("Password reset confirmation failed");

        return emailChangeJson(
            {
                success: false,
                message:
                    "შენახვის შედეგი ვერ დადასტურდა. ხელახლა სცადე; თუ ბმული აღარ მოქმედებს, სცადე ახალი პაროლით შესვლა.",
                field: "form",
            },
            500,
        );
    } finally {
        await prisma.$disconnect();
    }
}