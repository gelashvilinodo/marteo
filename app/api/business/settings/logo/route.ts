import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { BusinessSettingsError } from "@/lib/business/business-settings";
import {
    readBusinessLogoForm,
    uploadBusinessLogo,
} from "@/lib/business/upload-business-logo";
import { removeUnusedImages } from "@/lib/storage/remove-unused-images";

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

async function readBusiness(
    tx: Prisma.TransactionClient,
    context: { userId: string; businessId: string },
) {
    const membership = await tx.businessMembership.findUnique({
        where: {
            userId_businessId: context,
        },
        select: { role: true },
    });

    if (
        !membership ||
        !["OWNER", "ADMIN"].includes(membership.role)
    ) {
        throw new BusinessSettingsError(
            "ბიზნესის პარამეტრებზე წვდომა არ გაქვთ.",
            403,
        );
    }

    const business = await tx.business.findUnique({
        where: { id: context.businessId },
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

function removeUnusedLogos(
    prisma: ReturnType<typeof createPrismaClient>,
    urls: Array<string | null>,
) {
    return removeUnusedImages("business-logos", urls, async candidates =>
        (
            await prisma.business.findMany({
                where: { logoUrl: { in: candidates } },
                select: { logoUrl: true },
            })
        ).map(business => business.logoUrl),
    );
}

export async function POST(request: Request) {
    const accessDenied = await apiAccessDenied("OWNER", "edit"); if (accessDenied) return accessDenied;
    const prisma = createPrismaClient();
    let uploadedLogoUrl: string | null = null;

    try {
        if (
            request.headers.get("origin") !==
            new URL(request.url).origin
        ) {
            throw new BusinessSettingsError(
                "მოთხოვნა ვერ დადასტურდა.",
                403,
            );
        }

        const user = await getCurrentUser();

        if (!user) {
            throw new BusinessSettingsError(
                "გაიარეთ ავტორიზაცია.",
                401,
            );
        }

        const current = await getCurrentBusiness();

        if (!current) {
            throw new BusinessSettingsError(
                "ბიზნესი ვერ მოიძებნა.",
                403,
            );
        }

        const context = {
            userId: user.id,
            businessId: current.businessId,
        };

        // Check access before reading or uploading the photo.
        await prisma.$transaction(
            (tx) => readBusiness(tx, context),
        );

        const form = await readBusinessLogoForm(request);
        const expectedUpdatedAt = form.get("expectedUpdatedAt");

        if (
            typeof expectedUpdatedAt !== "string" ||
            !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
            new Date(expectedUpdatedAt).toISOString() !==
                expectedUpdatedAt
        ) {
            throw new BusinessSettingsError(
                "განაახლეთ ბიზნესის მონაცემები და სცადეთ ხელახლა.",
                409,
            );
        }

        const beforeUpload = await prisma.$transaction(
            (tx) => readBusiness(tx, context),
        );

        if (
            beforeUpload.updatedAt.toISOString() !==
            expectedUpdatedAt
        ) {
            throw new BusinessSettingsError(
                "ბიზნესის მონაცემები შეიცვალა. განაახლეთ მონაცემები და ხელახლა აირჩიეთ ლოგო.",
                409,
            );
        }

        // Storage upload runs outside the database transaction.
        const logoUrl = await uploadBusinessLogo(
            context.businessId,
            form.get("file"),
        );
        uploadedLogoUrl = logoUrl;

        const { business, previousLogoUrl } = await prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "Business"
                    WHERE id = ${context.businessId}
                    FOR UPDATE
                `;

                const latest = await readBusiness(tx, context);

                if (
                    latest.updatedAt.toISOString() !==
                    expectedUpdatedAt
                ) {
                    throw new BusinessSettingsError(
                        "ატვირთვისას ბიზნესის მონაცემები შეიცვალა. განაახლეთ მონაცემები და ხელახლა აირჩიეთ ლოგო.",
                        409,
                    );
                }

                return {
                    business: await tx.business.update({
                        where: { id: context.businessId },
                        data: { logoUrl },
                        select: businessSelect,
                    }),
                    previousLogoUrl: latest.logoUrl,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.ReadCommitted,
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        // The new logo is saved, so the replaced one can go.
        uploadedLogoUrl = null;
        await removeUnusedLogos(prisma, [previousLogoUrl]);

        return json({
            success: true,
            business: {
                ...business,
                updatedAt: business.updatedAt.toISOString(),
            },
        });
    } catch (cause: unknown) {
        // A logo the database does not use was never saved.
        if (uploadedLogoUrl) {
            await removeUnusedLogos(prisma, [uploadedLogoUrl]);
        }

        if (cause instanceof BusinessSettingsError) {
            return json(
                {
                    success: false,
                    message: cause.message,
                    field: cause.field,
                },
                cause.status,
            );
        }

        console.error("Business logo save failed");

        return json(
            {
                success: false,
                message:
                    "ლოგოს შენახვის შედეგი ვერ დადასტურდა. განაახლეთ მონაცემები და გადაამოწმეთ ლოგო.",
                field: "form",
            },
            500,
        );
    } finally {
        await prisma.$disconnect();
    }
}