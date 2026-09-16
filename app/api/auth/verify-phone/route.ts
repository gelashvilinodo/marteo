import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

import { createPrismaClient } from "@/lib/prisma";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

class RequestError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = "RequestError";
    }
}

function hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);

    if (
        body === null ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !("userId" in body) ||
        !("code" in body) ||
        typeof body.userId !== "string" ||
        typeof body.code !== "string"
    ) {
        return errorResponse(
            "ვერიფიკაციის მონაცემები არასწორია.",
            400
        );
    }

    const userId = body.userId.trim();
    const code = body.code.trim();

    if (!userId || !/^\d{6}$/.test(code)) {
        return errorResponse(
            "ტელეფონის კოდი უნდა შეიცავდეს 6 ციფრს.",
            400
        );
    }

    try {
        const prisma = createPrismaClient();

        const sessionToken = randomBytes(32).toString("hex");
        const sessionTokenHash = hashToken(sessionToken);
        const codeHash = hashToken(code);

        const sessionExpiresAt = new Date(
            Date.now() + SESSION_DURATION_MS
        );

        await prisma.$transaction(
            async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    select: {
                        id: true,
                        status: true,
                        emailVerifiedAt: true,
                        phoneVerifiedAt: true,
                    },
                });

                if (!user) {
                    throw new RequestError(
                        "მომხმარებელი ვერ მოიძებნა.",
                        404
                    );
                }

                if (user.status === "SUSPENDED") {
                    throw new RequestError(
                        "ანგარიში შეჩერებულია.",
                        403
                    );
                }

                if (
                    user.status !== "PENDING_VERIFICATION" ||
                    user.phoneVerifiedAt
                ) {
                    throw new RequestError(
                        "რეგისტრაცია უკვე დასრულებულია. ანგარიშში შესასვლელად გამოიყენეთ შესვლის გვერდი.",
                        409
                    );
                }

                if (!user.emailVerifiedAt) {
                    throw new RequestError(
                        "ტელეფონის დადასტურებამდე საჭიროა ელფოსტის დადასტურება.",
                        400
                    );
                }

                const verification =
                    await tx.verificationToken.findFirst({
                        where: {
                            userId,
                            type: "PHONE",
                            token: codeHash,
                            usedAt: null,
                            expiresAt: { gt: new Date() },
                        },
                        orderBy: { createdAt: "desc" },
                        select: { id: true },
                    });

                if (!verification) {
                    throw new RequestError(
                        "კოდი არასწორია, გამოყენებულია ან ვადა გაუვიდა.",
                        400
                    );
                }

                const now = new Date();

                // Consume only a still-unused, unexpired token.
                const consumed =
                    await tx.verificationToken.updateMany({
                        where: {
                            id: verification.id,
                            userId,
                            type: "PHONE",
                            token: codeHash,
                            usedAt: null,
                            expiresAt: { gt: now },
                        },
                        data: {
                            usedAt: now,
                        },
                    });

                if (consumed.count !== 1) {
                    throw new RequestError(
                        "კოდი უკვე გამოყენებულია ან ვადა გაუვიდა.",
                        409
                    );
                }

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
                    throw new RequestError(
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
            },
            {
                isolationLevel: "Serializable",
            }
        );

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
        if (error instanceof RequestError) {
            return errorResponse(error.message, error.status);
        }

        if (
            error !== null &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2034"
        ) {
            return errorResponse(
                "მოთხოვნები ერთმანეთს დაემთხვა. სცადეთ დადასტურება ხელახლა.",
                409
            );
        }

        return errorResponse(
            "ტელეფონის დადასტურება ვერ მოხერხდა. გთხოვთ სცადოთ ხელახლა.",
            500
        );
    }
}