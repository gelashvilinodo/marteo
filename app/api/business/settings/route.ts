import type { BusinessMode } from "@/lib/business/business-mode";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

import {
    BusinessSettingsError,
    validateBusinessSettings,
    type BusinessSettingsData,
} from "@/lib/business/business-settings";

const businessSelect = {
    id: true,
    name: true,
    mode: true,
    logoUrl: true,
    phone: true,
    updatedAt: true,
} as const;

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

function failure(cause: unknown) {
    if (cause instanceof BusinessSettingsError) {
        return json({
            success: false,
            message: cause.message,
            field: cause.field,
        }, cause.status);
    }

    console.error("Business settings request failed");

    return json({
        success: false,
        message:
            "ბიზნესის პარამეტრების დამუშავების შედეგი ვერ დადასტურდა. ხელახლა სცადე.",
        field: "form",
    }, 500);
}

function serialize(value: {
    id: string;
    mode: BusinessMode;
    name: string;
    logoUrl: string | null;
    phone: string | null;
    updatedAt: Date;
}): BusinessSettingsData {
    return {
        id: value.id,
        mode: value.mode,
        name: value.name,
        logoUrl: value.logoUrl,
        phone: value.phone,
        updatedAt: value.updatedAt.toISOString(),
    };
}

async function getContext() {
    const user = await getCurrentUser();

    if (!user) {
        throw new BusinessSettingsError(
            "გაიარე ავტორიზაცია.",
            401,
        );
    }

    const membership = await getCurrentBusiness();

    if (!membership) {
        throw new BusinessSettingsError(
            "ბიზნესი ვერ მოიძებნა.",
            403,
        );
    }

    return {
        userId: user.id,
        businessId: membership.businessId,
    };
}

async function readBusiness(
    tx: Prisma.TransactionClient,
    context: {
        userId: string;
        businessId: string;
    },
) {
    const access = await tx.businessMembership.findUnique({
        where: {
            userId_businessId: context,
        },
        select: {
            role: true,
        },
    });

    if (
        !access ||
        !["OWNER", "ADMIN"].includes(access.role)
    ) {
        throw new BusinessSettingsError(
            "ბიზნესის პარამეტრებზე წვდომა არ გაქვს.",
            403,
        );
    }

    const business = await tx.business.findUnique({
        where: {
            id: context.businessId,
        },
        select: businessSelect,
    });

    if (!business) {
        throw new BusinessSettingsError(
            "ბიზნესი ვერ მოიძებნა.",
            404,
        );
    }

    return business;
}

async function readBody(request: Request): Promise<unknown> {
    if (
        request.headers.get("origin") !==
        new URL(request.url).origin
    ) {
        throw new BusinessSettingsError(
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
        throw new BusinessSettingsError(
            "მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.",
            415,
        );
    }

    if (!request.body) {
        throw new BusinessSettingsError(
            "მოთხოვნა ცარიელია.",
            400,
        );
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf-8", {
        fatal: true,
    });

    const parts: string[] = [];
    let bytes = 0;

    try {
        while (true) {
            const chunk = await reader.read();

            if (chunk.done) break;

            bytes += chunk.value.byteLength;

            if (bytes > 8192) {
                await reader.cancel();

                throw new BusinessSettingsError(
                    "გამოგზავნილი მონაცემები ზედმეტად დიდია.",
                    413,
                );
            }

            parts.push(
                decoder.decode(chunk.value, {
                    stream: true,
                }),
            );
        }

        parts.push(decoder.decode());

        return JSON.parse(parts.join("")) as unknown;
    } catch (cause: unknown) {
        if (cause instanceof BusinessSettingsError) {
            throw cause;
        }

        throw new BusinessSettingsError(
            "მონაცემების ფორმატი არასწორია.",
            400,
        );
    } finally {
        reader.releaseLock();
    }
}

export async function GET() {
    try {
        const context = await getContext();
        const prisma = createPrismaClient();

        try {
            const business = await prisma.$transaction(
                tx => readBusiness(tx, context),
                {
                    isolationLevel: "RepeatableRead",
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            );

            return json({
                success: true,
                business: serialize(business),
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return failure(cause);
    }
}

export async function PATCH(request: Request) {
    try {
        const context = await getContext();
        const input = validateBusinessSettings(
            await readBody(request),
        );

        const prisma = createPrismaClient();

        try {
            const business = await prisma.$transaction(
                async tx => {
                    const locked = await tx.$queryRaw<
                        Array<{ id: string }>
                    >(Prisma.sql`
                        SELECT id
                        FROM "Business"
                        WHERE id = ${context.businessId}
                        FOR UPDATE
                    `);

                    if (locked.length === 0) {
                        throw new BusinessSettingsError(
                            "ბიზნესი ვერ მოიძებნა.",
                            404,
                        );
                    }

                    const current = await readBusiness(
                        tx,
                        context,
                    );

                    const unchanged =
                        current.name === input.name &&
                        current.phone === input.phone &&
                        current.mode === input.mode;

                    // დაკარგული პასუხის შემდეგ იმავე მონაცემებით
                    // გამეორება დამატებით ცვლილებას არ შექმნის.
                    if (unchanged) return current;

                    if (
                        current.updatedAt.getTime() !==
                        input.expectedUpdatedAt.getTime()
                    ) {
                        throw new BusinessSettingsError(
                            "ბიზნესის ინფორმაცია სხვა ფანჯრიდან შეიცვალა. განაახლე მონაცემები და ცვლილებები გადაამოწმე.",
                            409,
                        );
                    }

                    return tx.business.update({
                        where: {
                            id: context.businessId,
                        },
                        data: {
                            name: input.name,
                            mode: input.mode,
                            phone: input.phone,
                        },
                        select: businessSelect,
                    });
                },
                {
                    isolationLevel: "ReadCommitted",
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            );

            return json({
                success: true,
                business: serialize(business),
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return failure(cause);
    }
}