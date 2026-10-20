import { getCurrentUserWithClient } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ProfileSettingsError } from "@/lib/profile/profile-settings";
import {
    readProfileAvatarForm,
    uploadProfileAvatar,
} from "@/lib/profile/upload-profile-avatar";

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

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        if (
            request.headers.get("origin") !==
            new URL(request.url).origin
        ) {
            throw new ProfileSettingsError(
                "მოთხოვნის წყარო დაუშვებელია.",
                403,
            );
        }

        const user = await getCurrentUserWithClient(() => prisma);

        if (!user) {
            throw new ProfileSettingsError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        const form = await readProfileAvatarForm(request);
        const version = form.get("expectedUpdatedAt");

        if (
            typeof version !== "string" ||
            !Number.isFinite(Date.parse(version)) ||
            new Date(version).toISOString() !== version
        ) {
            throw new ProfileSettingsError(
                "განაახლე პროფილის მონაცემები და სცადე ხელახლა.",
                409,
            );
        }

        const beforeUpload = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                status: true,
                updatedAt: true,
            },
        });

        if (!beforeUpload || beforeUpload.status !== "ACTIVE") {
            throw new ProfileSettingsError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        if (beforeUpload.updatedAt.toISOString() !== version) {
            throw new ProfileSettingsError(
                "პროფილის მონაცემები შეიცვალა. განაახლე მონაცემები და ხელახლა აირჩიე ფოტო.",
                409,
            );
        }

        // The client sends the already prepared, compressed image.
        const avatarUrl = await uploadProfileAvatar(
            user.id,
            form.get("file"),
        );

        const profile = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${user.id}
                    FOR UPDATE
                `;

                const latest = await tx.user.findUnique({
                    where: { id: user.id },
                    select: {
                        status: true,
                        updatedAt: true,
                    },
                });

                if (!latest || latest.status !== "ACTIVE") {
                    throw new ProfileSettingsError(
                        "გაიარე ავტორიზაცია.",
                        401,
                    );
                }

                if (latest.updatedAt.toISOString() !== version) {
                    throw new ProfileSettingsError(
                        "ატვირთვისას პროფილის მონაცემები შეიცვალა. განაახლე მონაცემები და ხელახლა აირჩიე ფოტო.",
                        409,
                    );
                }

                return tx.user.update({
                    where: { id: user.id },
                    data: { avatarUrl },
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
            profile: {
                ...profile,
                emailVerifiedAt:
                    profile.emailVerifiedAt?.toISOString() ?? null,
                phoneVerifiedAt:
                    profile.phoneVerifiedAt?.toISOString() ?? null,
                createdAt: profile.createdAt.toISOString(),
                updatedAt: profile.updatedAt.toISOString(),
            },
        });
    } catch (cause: unknown) {
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

        console.error("Profile avatar save failed");

        return json(
            {
                success: false,
                message:
                    "ფოტოს შენახვის შედეგი ვერ დადასტურდა. განაახლე პროფილის მონაცემები და გადაამოწმე ფოტო.",
                field: "form",
            },
            500,
        );
    } finally {
        await prisma.$disconnect();
    }
}