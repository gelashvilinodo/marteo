import { createHash } from "crypto";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";

const MAX_ATTEMPTS = 5;

type VerificationResult =
    | { ok: true }
    | { ok: false; error: string; status: number };

export class RegistrationError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = "RegistrationError";
    }
}

function failure(error: string, status = 400): VerificationResult {
    return { ok: false, error, status };
}

export async function readOtpRequest(request: Request) {
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
        return null;
    }

    const userId = body.userId.trim();
    const code = body.code.trim();

    if (!userId || !/^\d{6}$/.test(code)) return null;

    return { userId, code };
}

// Call only inside the caller's Serializable transaction.
// Successful verification consumes the code in that same transaction.
export async function consumeRegistrationOtp(
    tx: Prisma.TransactionClient,
    userId: string,
    type: "EMAIL" | "PHONE",
    code: string
): Promise<VerificationResult> {
    const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
            status: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
        },
    });

    if (!user) {
        return failure("მომხმარებელი ვერ მოიძებნა.", 404);
    }

    if (user.status === "SUSPENDED") {
        return failure("ანგარიში შეჩერებულია.", 403);
    }

    if (user.status !== "PENDING_VERIFICATION") {
        return failure(
            "რეგისტრაცია უკვე დასრულებულია. გამოიყენეთ შესვლის გვერდი.",
            409
        );
    }

    if (type === "EMAIL" && user.emailVerifiedAt) {
        return failure("ელფოსტა უკვე დადასტურებულია.", 409);
    }

    if (type === "PHONE") {
        if (!user.emailVerifiedAt) {
            return failure("ჯერ დაადასტურეთ ელფოსტა.");
        }

        if (user.phoneVerifiedAt) {
            return failure("ტელეფონი უკვე დადასტურებულია.", 409);
        }
    }

    // Select the latest unused code, not a token matching the submitted hash.
    // Otherwise incorrect guesses could not be counted.
    const token = await tx.verificationToken.findFirst({
        where: {
            userId,
            type,
            usedAt: null,
        },
        orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
        ],
        select: {
            id: true,
            token: true,
            expiresAt: true,
            attempts: true,
        },
    });

    const now = new Date();

    if (!token || token.expiresAt <= now) {
        return failure(
            "კოდი გამოყენებულია ან ვადა გაუვიდა. მოითხოვეთ ახალი კოდი."
        );
    }

    if (token.attempts >= MAX_ATTEMPTS) {
        return failure(
            "მცდელობების ლიმიტი ამოიწურა. მოითხოვეთ ახალი კოდი.",
            429
        );
    }

    const submittedHash = createHash("sha256")
        .update(code)
        .digest("hex");

    if (submittedHash !== token.token) {
        const updated = await tx.verificationToken.updateMany({
            where: {
                id: token.id,
                usedAt: null,
                attempts: token.attempts,
                expiresAt: { gt: now },
            },
            data: {
                attempts: { increment: 1 },
            },
        });

        if (updated.count !== 1) {
            throw new RegistrationError(
                "კოდის მდგომარეობა შეიცვალა. სცადეთ ხელახლა.",
                409
            );
        }

        const remaining = MAX_ATTEMPTS - token.attempts - 1;

        // Return instead of throwing, so the attempt counter is committed.
        return failure(
            remaining > 0
                ? `კოდი არასწორია. დარჩენილია ${remaining} მცდელობა.`
                : "მცდელობების ლიმიტი ამოიწურა. მოითხოვეთ ახალი კოდი.",
            remaining > 0 ? 400 : 429
        );
    }

    const consumed = await tx.verificationToken.updateMany({
        where: {
            id: token.id,
            usedAt: null,
            attempts: { lt: MAX_ATTEMPTS },
            expiresAt: { gt: new Date() },
        },
        data: {
            usedAt: new Date(),
        },
    });

    if (consumed.count !== 1) {
        throw new RegistrationError(
            "კოდი უკვე გამოყენებულია ან ვადა გაუვიდა.",
            409
        );
    }

    return { ok: true };
}

export function registrationErrorResponse(error: unknown) {
    if (error instanceof RegistrationError) {
        return NextResponse.json(
            { error: error.message },
            { status: error.status }
        );
    }

    if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2034"
    ) {
        return NextResponse.json(
            {
                error:
                    "მოთხოვნები ერთმანეთს დაემთხვა. სცადეთ დადასტურება ხელახლა.",
            },
            { status: 409 }
        );
    }

    return NextResponse.json(
        { error: "დადასტურება ვერ მოხერხდა. სცადეთ ხელახლა." },
        { status: 500 }
    );
}