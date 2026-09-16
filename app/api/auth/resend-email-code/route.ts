import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LIFETIME_MS = 10 * 60 * 1000;

class RequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfter = 0
    ) {
        super(message);
        this.name = "RequestError";
    }
}

function errorResponse(
    message: string,
    status: number,
    retryAfter = 0
) {
    return NextResponse.json(
        { error: message },
        {
            status,
            headers:
                retryAfter > 0
                    ? { "Retry-After": String(retryAfter) }
                    : undefined,
        }
    );
}

export async function POST(request: Request) {
    const body: unknown = await request.json().catch(() => null);

    if (
        body === null ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !("userId" in body) ||
        typeof body.userId !== "string" ||
        !body.userId.trim()
    ) {
        return errorResponse(
            "მომხმარებლის მონაცემი არასწორია.",
            400
        );
    }

    const userId = body.userId.trim();

    try {
        const prisma = createPrismaClient();

        const code = randomInt(100000, 1000000).toString();
        const codeHash = createHash("sha256")
            .update(code)
            .digest("hex");

        const delivery = await prisma.$transaction(
            async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        emailVerifiedAt: true,
                        status: true,
                    },
                });

                if (!user) {
                    throw new RequestError(
                        "მომხმარებელი ვერ მოიძებნა.",
                        404
                    );
                }

                if (user.emailVerifiedAt) {
                    throw new RequestError(
                        "ელფოსტა უკვე დადასტურებულია.",
                        409
                    );
                }

                if (user.status !== "PENDING_VERIFICATION") {
                    throw new RequestError(
                        "ამ ანგარიშისთვის კოდის გაგზავნა დაუშვებელია.",
                        403
                    );
                }

                // Includes the first code created during registration.
                const latestToken =
                    await tx.verificationToken.findFirst({
                        where: {
                            userId: user.id,
                            type: "EMAIL",
                        },
                        orderBy: {
                            createdAt: "desc",
                        },
                        select: {
                            createdAt: true,
                        },
                    });

                const now = new Date();

                if (latestToken) {
                    const retryAfter = Math.ceil(
                        (
                            latestToken.createdAt.getTime() +
                            RESEND_COOLDOWN_SECONDS * 1000 -
                            now.getTime()
                        ) / 1000
                    );

                    if (retryAfter > 0) {
                        throw new RequestError(
                            `კოდის ხელახლა გაგზავნა შესაძლებელი იქნება ${retryAfter} წამში.`,
                            429,
                            retryAfter
                        );
                    }
                }

                // Replace previous unused Email codes atomically.
                await tx.verificationToken.deleteMany({
                    where: {
                        userId: user.id,
                        type: "EMAIL",
                        usedAt: null,
                    },
                });

                await tx.verificationToken.create({
                    data: {
                        userId: user.id,
                        type: "EMAIL",
                        token: codeHash,
                        createdAt: now,
                        expiresAt: new Date(
                            now.getTime() + CODE_LIFETIME_MS
                        ),
                    },
                });

                return {
                    email: user.email,
                    firstName: user.firstName ?? "",
                };
            },
            {
                isolationLevel: "Serializable",
            }
        );

        // Send only after the database transaction commits.
        try {
            await sendVerificationEmail({
                to: delivery.email,
                firstName: delivery.firstName,
                token: code,
            });
        } catch {
            // Keep the cooldown even if delivery fails or is uncertain.
            // A provider may have accepted the email before a timeout.
            return errorResponse(
                "ელფოსტის გაგზავნა ვერ დადასტურდა. შეამოწმეთ შემოსული წერილები ან სცადეთ ხელახლა 60 წამში.",
                502,
                RESEND_COOLDOWN_SECONDS
            );
        }

        return NextResponse.json({
            success: true,
            message: "ელფოსტის კოდი ხელახლა გაიგზავნა.",
        });
    } catch (error) {
        if (error instanceof RequestError) {
            return errorResponse(
                error.message,
                error.status,
                error.retryAfter
            );
        }

        // Concurrent resend requests can conflict under Serializable.
        // The failed transaction sends no email.
        if (
            error !== null &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2034"
        ) {
            return errorResponse(
                "მოთხოვნები ერთმანეთს დაემთხვა. სცადეთ ხელახლა რამდენიმე წამში.",
                409,
                2
            );
        }

        return errorResponse(
            "ელფოსტის კოდის ხელახლა გაგზავნა ვერ მოხერხდა.",
            500
        );
    }
}