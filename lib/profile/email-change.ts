import "server-only";

import { createHash } from "crypto";
import { cookies } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";

export const EMAIL_CHANGE_LIFETIME_MS = 10 * 60 * 1000;
export const EMAIL_CHANGE_RESEND_SECONDS = 60;
export const EMAIL_CHANGE_MAX_ATTEMPTS = 5;

export class EmailChangeError extends Error {
    constructor(
        message: string,
        public status = 400,
        public retryAfter = 0,
    ) {
        super(message);
        this.name = "EmailChangeError";
    }
}

export function hashEmailChangeValue(value: string): string {
    return createHash("sha256")
        .update(value)
        .digest("hex");
}

export function hashEmailChangeCode(
    authorization: string,
    code: string,
): string {
    return hashEmailChangeValue(
        `email-change:${authorization}:${code}`,
    );
}

export function emailChangeJson(
    data: unknown,
    status = 200,
    retryAfter = 0,
) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
            ...(retryAfter > 0
                ? { "Retry-After": String(retryAfter) }
                : {}),
        },
    });
}

export function emailChangeFailure(cause: unknown) {
    if (cause instanceof EmailChangeError) {
        return emailChangeJson(
            {
                success: false,
                message: cause.message,
                retryAfter: cause.retryAfter,
            },
            cause.status,
            cause.retryAfter,
        );
    }

    console.error("Email change request failed");

    return emailChangeJson(
        {
            success: false,
            message:
                "მოთხოვნის შედეგი ვერ დადასტურდა. სცადე ხელახლა.",
        },
        500,
    );
}

export async function readEmailChangeBody(
    request: Request,
): Promise<Record<string, unknown>> {
    if (
        request.headers.get("origin") !==
        new URL(request.url).origin
    ) {
        throw new EmailChangeError(
            "მოთხოვნის წყარო დაუშვებელია.",
            403,
        );
    }

    const contentType = request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();

    if (contentType !== "application/json") {
        throw new EmailChangeError(
            "მონაცემების გაგზავნის ფორმატი არასწორია.",
            415,
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new EmailChangeError("მოთხოვნა ცარიელია.");
    }

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts: string[] = [];
    let bytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            bytes += value.byteLength;

            if (bytes > 8192) {
                await reader.cancel();

                throw new EmailChangeError(
                    "გამოგზავნილი მონაცემები ზედმეტად დიდია.",
                    413,
                );
            }

            parts.push(decoder.decode(value, { stream: true }));
        }

        parts.push(decoder.decode());

        const body: unknown = JSON.parse(parts.join(""));

        if (
            body === null ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            throw new EmailChangeError(
                "მონაცემების ფორმატი არასწორია.",
            );
        }

        return body as Record<string, unknown>;
    } catch (cause: unknown) {
        if (cause instanceof EmailChangeError) {
            throw cause;
        }

        throw new EmailChangeError(
            "მონაცემების ფორმატი არასწორია.",
        );
    } finally {
        reader.releaseLock();
    }
}

export async function readEmailChangeSession(
    tx: Prisma.TransactionClient,
) {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get("marteo_session")?.value;

    if (!rawToken) {
        throw new EmailChangeError(
            "გაიარე ავტორიზაცია.",
            401,
        );
    }

    const sessionTokenHash = hashEmailChangeValue(rawToken);

    const session = await tx.session.findUnique({
        where: { tokenHash: sessionTokenHash },
        select: {
            id: true,
            expiresAt: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    phone: true,
                    firstName: true,
                    password: true,
                    status: true,
                },
            },
        },
    });

    if (
        !session ||
        session.expiresAt <= new Date() ||
        session.user.status !== "ACTIVE"
    ) {
        throw new EmailChangeError(
            "სესიის ვადა ამოიწურა. თავიდან შედი ანგარიშში.",
            401,
        );
    }

    return {
        sessionId: session.id,
        sessionTokenHash,
        user: session.user,
    };
}