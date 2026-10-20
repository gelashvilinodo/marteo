import { getCurrentUserWithClient } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

import {
    ProfileSettingsError,
    validateProfileSettings,
    type ProfileSettingsData,
} from "@/lib/profile/profile-settings";

const profileSelect = {
    id: true,
    firstName: true,
    lastName: true,
    avatarUrl: true,
    email: true,
    phone: true,
    emailVerifiedAt: true,
    phoneVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

type ProfileRecord = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    email: string;
    phone: string;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

function serialize(profile: ProfileRecord): ProfileSettingsData {
    return {
        ...profile,
        emailVerifiedAt:
            profile.emailVerifiedAt?.toISOString() ?? null,
        phoneVerifiedAt:
            profile.phoneVerifiedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
    };
}

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

function failure(cause: unknown) {
    if (cause instanceof ProfileSettingsError) {
        return json(
            {
                success: false,
                message: cause.message,
                field: cause.field,
            },
            cause.status,
        );
    }

    console.error("Profile settings request failed");

    return json(
        {
            success: false,
            message:
                "მოთხოვნის შედეგი ვერ დადასტურდა. განაახლე პროფილის მონაცემები და გადაამოწმე.",
            field: "form",
        },
        500,
    );
}

async function readBody(request: Request): Promise<unknown> {
    if (
        request.headers.get("origin") !==
        new URL(request.url).origin
    ) {
        throw new ProfileSettingsError(
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
        throw new ProfileSettingsError(
            "მონაცემების გაგზავნის ფორმატი არასწორია.",
            415,
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new ProfileSettingsError(
            "მოთხოვნა ცარიელია.",
            400,
        );
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

                throw new ProfileSettingsError(
                    "გამოგზავნილი მონაცემები ზედმეტად დიდია.",
                    413,
                );
            }

            parts.push(decoder.decode(value, { stream: true }));
        }

        parts.push(decoder.decode());

        return JSON.parse(parts.join("")) as unknown;
    } catch (cause: unknown) {
        if (cause instanceof ProfileSettingsError) {
            throw cause;
        }

        throw new ProfileSettingsError(
            "მონაცემების ფორმატი არასწორია.",
            400,
        );
    } finally {
        reader.releaseLock();
    }
}

export async function GET() {
    const prisma = createPrismaClient();

    try {
        const user = await getCurrentUserWithClient(() => prisma);

        if (!user) {
            throw new ProfileSettingsError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        const profile = await prisma.user.findUnique({
            where: { id: user.id },
            select: profileSelect,
        });

        if (!profile) {
            throw new ProfileSettingsError(
                "პროფილი ვერ მოიძებნა.",
                404,
            );
        }

        return json({
            success: true,
            profile: serialize(profile),
        });
    } catch (cause: unknown) {
        return failure(cause);
    } finally {
        await prisma.$disconnect();
    }
}

export async function PATCH(request: Request) {
    const prisma = createPrismaClient();

    try {
        const user = await getCurrentUserWithClient(() => prisma);

        if (!user) {
            throw new ProfileSettingsError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        const input = validateProfileSettings(
            await readBody(request),
        );

        const profile = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${user.id}
                    FOR UPDATE
                `;

                const current = await tx.user.findUnique({
                    where: { id: user.id },
                    select: {
                        ...profileSelect,
                        status: true,
                    },
                });

                if (!current || current.status !== "ACTIVE") {
                    throw new ProfileSettingsError(
                        "გაიარე ავტორიზაცია.",
                        401,
                    );
                }

                // Repeating a successful request changes nothing.
                if (
                    current.firstName === input.firstName &&
                    current.lastName === input.lastName
                ) {
                    const { status: _status, ...unchanged } = current;
                    return unchanged;
                }

                if (
                    current.updatedAt.getTime() !==
                    input.expectedUpdatedAt.getTime()
                ) {
                    throw new ProfileSettingsError(
                        "პროფილის მონაცემები შეიცვალა. განაახლე მონაცემები და ხელახლა შეინახე ცვლილებები.",
                        409,
                    );
                }

                return tx.user.update({
                    where: { id: user.id },
                    data: {
                        firstName: input.firstName,
                        lastName: input.lastName,
                    },
                    select: profileSelect,
                });
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.ReadCommitted,
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        return json({
            success: true,
            profile: serialize(profile),
        });
    } catch (cause: unknown) {
        return failure(cause);
    } finally {
        await prisma.$disconnect();
    }
}