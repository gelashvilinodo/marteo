import { randomBytes } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import {
    EmailChangeError,
    emailChangeJson,
    hashEmailChangeValue,
    readEmailChangeBody,
} from "@/lib/profile/email-change";
import {
    PASSWORD_RESET_LIFETIME_MS,
    sendPasswordResetEmail,
} from "@/lib/auth/send-password-reset-email";

const RESEND_COOLDOWN_MS = 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function accepted() {
    return emailChangeJson({
        success: true,
        retryAfter: 60,
        message:
            "თუ ამ ელფოსტით აქტიური ანგარიში არსებობს, პაროლის აღდგენის ბმულს მიიღებ. შეამოწმე შემომავალი წერილები და სპამის საქაღალდე.",
    });
}

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readEmailChangeBody(request);

        if (typeof body.email !== "string") {
            return emailChangeJson(
                {
                    success: false,
                    message: "მიუთითე ელფოსტა.",
                },
                422,
            );
        }

        const email = body.email.trim().toLowerCase();

        if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            /[\u0000-\u001f\u007f]/u.test(email)
        ) {
            return emailChangeJson(
                {
                    success: false,
                    message: "მიუთითე სწორი ელფოსტა.",
                },
                422,
            );
        }

        const account = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (!account) return accepted();

        const token = randomBytes(32).toString("hex");

        const delivery = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${account.id}
                    FOR UPDATE
                `;

                const user = await tx.user.findUnique({
                    where: { id: account.id },
                    select: {
                        id: true,
                        email: true,
                        password: true,
                        status: true,
                        emailVerifiedAt: true,
                    },
                });

                if (
                    !user ||
                    user.email !== email ||
                    user.status !== "ACTIVE" ||
                    !user.emailVerifiedAt
                ) {
                    return null;
                }

                const now = new Date();

                const recent = await tx.passwordResetRequest.findMany({
                    where: {
                        userId: user.id,
                        createdAt: {
                            gt: new Date(
                                now.getTime() - REQUEST_WINDOW_MS,
                            ),
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: MAX_REQUESTS_PER_WINDOW,
                    select: { createdAt: true },
                });

                if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
                    return null;
                }

                if (
                    recent[0] &&
                    recent[0].createdAt.getTime() +
                        RESEND_COOLDOWN_MS > now.getTime()
                ) {
                    return null;
                }

                await tx.passwordResetRequest.create({
                    data: {
                        userId: user.id,
                        email: user.email,
                        tokenHash: hashEmailChangeValue(token),
                        passwordFingerprint:
                            hashEmailChangeValue(user.password),
                        expiresAt: new Date(
                            now.getTime() + PASSWORD_RESET_LIFETIME_MS,
                        ),
                    },
                });

                // Earlier valid links remain usable until expiry
                // or a successful password change.
                return { email: user.email };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        if (delivery) {
            try {
                await sendPasswordResetEmail({
                    to: delivery.email,
                    token,
                });
            } catch {
                // Do not reveal whether the account exists.
                // Keep the cooldown when delivery is uncertain.
                console.error("Password reset email delivery failed");
            }
        }

        return accepted();
    } catch (cause: unknown) {
        if (cause instanceof EmailChangeError) {
            return emailChangeJson(
                {
                    success: false,
                    message: cause.message,
                },
                cause.status,
            );
        }

        console.error("Password reset request failed");

        return emailChangeJson(
            {
                success: false,
                message:
                    "მოთხოვნა ვერ დამუშავდა. ცოტა მოგვიანებით სცადე.",
            },
            503,
        );
    } finally {
        await prisma.$disconnect();
    }
}