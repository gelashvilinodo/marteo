import { rateLimitResponse } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

const COOLDOWN_SECONDS = 60;
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
        return errorResponse("მომხმარებლის მონაცემი არასწორია.", 400);
    }

    const userId = body.userId.trim();

    try {
        const prisma = createPrismaClient();
        const code = randomInt(100000, 1000000).toString();

        const codeHash = createHash("sha256")
            .update(code)
            .digest("hex");

        const phone = await prisma.$transaction(
            async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    select: {
                        id: true,
                        phone: true,
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

                if (user.status !== "PENDING_VERIFICATION") {
                    throw new RequestError(
                        "ამ ანგარიშისთვის რეგისტრაციის კოდის გაგზავნა დაუშვებელია.",
                        403
                    );
                }

                if (!user.emailVerifiedAt) {
                    throw new RequestError(
                        "ჯერ დაადასტურეთ ელფოსტა.",
                        400
                    );
                }

                if (user.phoneVerifiedAt) {
                    throw new RequestError(
                        "ტელეფონი უკვე დადასტურებულია.",
                        409
                    );
                }

                const latestToken =
                    await tx.verificationToken.findFirst({
                        where: {
                            userId: user.id,
                            type: "PHONE",
                        },
                        orderBy: { createdAt: "desc" },
                        select: { createdAt: true },
                    });

                const now = new Date();

                if (latestToken) {
                    const retryAfter = Math.ceil(
                        (
                            latestToken.createdAt.getTime() +
                            COOLDOWN_SECONDS * 1000 -
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

                await tx.verificationToken.deleteMany({
                    where: {
                        userId: user.id,
                        type: "PHONE",
                        usedAt: null,
                    },
                });

                await tx.verificationToken.create({
                    data: {
                        userId: user.id,
                        type: "PHONE",
                        token: codeHash,
                        createdAt: now,
                        expiresAt: new Date(
                            now.getTime() + CODE_LIFETIME_MS
                        ),
                    },
                });

                return user.phone;
            },
            {
                isolationLevel: "Serializable",
            }
        );

        // External delivery happens after the transaction commits.
        try {
            await sendSms({
                phone,
                message:
                    `MARTEO: თქვენი ტელეფონის დასადასტურებელი კოდია ${code}`,
            });
        } catch (deliveryError) {
            const limited = rateLimitResponse(deliveryError);
            if (limited) return limited;
            // Keep the cooldown if delivery failed or is uncertain.
            return errorResponse(
                "SMS-ის გაგზავნა ვერ დადასტურდა. შეამოწმეთ შეტყობინებები ან სცადეთ ხელახლა 60 წამში.",
                502,
                COOLDOWN_SECONDS
            );
        }

        return NextResponse.json({
            success: true,
            message: "SMS კოდი გაიგზავნა.",
        });
    } catch (error) {
        if (error instanceof RequestError) {
            return errorResponse(
                error.message,
                error.status,
                error.retryAfter
            );
        }

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

        return errorResponse("SMS კოდის გაგზავნა ვერ მოხერხდა.", 500);
    }
}