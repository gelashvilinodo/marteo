import { guardMutation } from "@/lib/security/mutation-request";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { consumeRegistrationOtp, readOtpRequest, RegistrationError, registrationErrorResponse } from "@/lib/auth/registration-otp";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

async function post(request: Request) {
    const input = await readOtpRequest(request);
    if (!input) return errorResponse("დადასტურების მონაცემები არასწორია.", 400);
    const { userId, code } = input;

    let prisma: ReturnType<typeof createPrismaClient> | undefined;
    try {
        prisma = createPrismaClient();

        const sessionToken = randomBytes(32).toString("hex");
        const sessionTokenHash = hashToken(sessionToken);

        const sessionExpiresAt = new Date(
            Date.now() + SESSION_DURATION_MS
        );

        const result = await prisma.$transaction(
            async (tx) => {
                const verified = await consumeRegistrationOtp(tx, userId, "PHONE", code);
                if (!verified.ok) return verified;
                const now = new Date();

                // Recheck account eligibility when applying the update.
                const activated = await tx.user.updateMany({
                    where: {
                        id: userId,
                        status: "PENDING_VERIFICATION",
                        emailVerifiedAt: { not: null },
                        phoneVerifiedAt: null,
                    },
                    data: {
                        phoneVerifiedAt: now,
                        status: "ACTIVE",
                    },
                });

                if (activated.count !== 1) {
                    throw new RegistrationError(
                        "ანგარიშის მდგომარეობა შეიცვალა. სცადეთ ხელახლა.",
                        409
                    );
                }

                await tx.session.create({
                    data: {
                        userId,
                        tokenHash: sessionTokenHash,
                        expiresAt: sessionExpiresAt,
                    },
                });

                // Invalidate any other unused registration Phone codes.
                await tx.verificationToken.deleteMany({
                    where: {
                        userId,
                        type: "PHONE",
                        usedAt: null,
                    },
                });
                return { ok: true as const };
            },
            {
                isolationLevel: "Serializable",
            }
        );

        if (!result.ok) return errorResponse(result.error, result.status);

        const response = NextResponse.json({
            message:
                "ტელეფონი წარმატებით დადასტურდა. თქვენი ანგარიში აქტიურია.",
            userId,
            emailVerified: true,
            phoneVerified: true,
            status: "ACTIVE",
        });

        response.cookies.set("marteo_session", sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            expires: sessionExpiresAt,
            path: "/",
        });

        return response;
    } catch (error) {
        return registrationErrorResponse(error);
    } finally {
        await prisma?.$disconnect();
    }
}

export const POST = guardMutation(post, "json");
