import { timingSafeEqual } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
    PHONE_CHANGE_MAX_ATTEMPTS,
    PhoneChangeError,
    phoneChangeFailure,
    phoneChangeJson,
    hashPhoneChangeCode,
    hashPhoneChangeValue,
    readPhoneChangeBody,
    readPhoneChangeSession,
} from "@/lib/profile/phone-change";

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

function hashesMatch(first: string, second: string): boolean {
    const left = Buffer.from(first, "hex");
    const right = Buffer.from(second, "hex");

    return (
        left.length === right.length &&
        timingSafeEqual(left, right)
    );
}

export async function POST(request: Request) {
    const prisma = createPrismaClient();

    try {
        const body = await readPhoneChangeBody(request);

        if (
            typeof body.authorization !== "string" ||
            !/^[a-f0-9]{64}$/.test(body.authorization)
        ) {
            throw new PhoneChangeError(
                "ჯერ დაადასტურე მიმდინარე პაროლი.",
                403,
            );
        }

        if (
            typeof body.code !== "string" ||
            !/^\d{6}$/.test(body.code)
        ) {
            throw new PhoneChangeError(
                "შეიყვანე ექვსნიშნა კოდი.",
                422,
            );
        }

        const authorization = body.authorization;
        const code = body.code;
        const initial = await readPhoneChangeSession(prisma);

        const result = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "User"
                    WHERE id = ${initial.user.id}
                    FOR UPDATE
                `;

                const current = await readPhoneChangeSession(tx);
                const now = new Date();

                if (
                    current.user.id !== initial.user.id ||
                    current.sessionTokenHash !== initial.sessionTokenHash
                ) {
                    throw new PhoneChangeError(
                        "სესია შეიცვალა. თავიდან გახსენი ფანჯარა.",
                        409,
                    );
                }

                const pending = await tx.phoneChangeRequest.findUnique({
                    where: {
                        authorizationHash:
                            hashPhoneChangeValue(authorization),
                    },
                });

                if (
                    !pending ||
                    pending.userId !== current.user.id ||
                    pending.sessionTokenHash !== current.sessionTokenHash ||
                    !pending.newPhone ||
                    !pending.codeHash ||
                    pending.passwordFingerprint !==
                        hashPhoneChangeValue(current.user.password)
                ) {
                    throw new PhoneChangeError(
                        "მოთხოვნა აღარ მოქმედებს. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                const correctCode = hashesMatch(
                    pending.codeHash,
                    hashPhoneChangeCode(authorization, code),
                );

                if (pending.usedAt) {
                    // Allow retrying after a lost successful response.
                    if (
                        correctCode &&
                        current.user.phone === pending.newPhone
                    ) {
                        const profile = await tx.user.findUniqueOrThrow({
                            where: { id: current.user.id },
                            select: profileSelect,
                        });

                        return {
                            ok: true as const,
                            profile,
                        };
                    }

                    throw new PhoneChangeError(
                        "მოთხოვნა უკვე დასრულებულია ან გაუქმებულია. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (
                    pending.expiresAt <= now ||
                    pending.previousPhone !== current.user.phone
                ) {
                    throw new PhoneChangeError(
                        "კოდის ვადა ამოიწურა ან ანგარიშის მონაცემები შეიცვალა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (pending.attempts >= PHONE_CHANGE_MAX_ATTEMPTS) {
                    throw new PhoneChangeError(
                        "კოდის მცდელობები ამოიწურა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (!correctCode) {
                    const attempts = pending.attempts + 1;

                    await tx.phoneChangeRequest.update({
                        where: { id: pending.id },
                        data: { attempts },
                    });

                    const remaining =
                        PHONE_CHANGE_MAX_ATTEMPTS - attempts;

                    // Commit the failed attempt instead of rolling it back.
                    return {
                        ok: false as const,
                        status: remaining > 0 ? 422 : 409,
                        message:
                            remaining > 0
                                ? `კოდი არასწორია. დარჩენილია ${remaining} მცდელობა.`
                                : "კოდის მცდელობები ამოიწურა. თავიდან დაადასტურე პაროლი.",
                    };
                }

                const existing = await tx.user.findUnique({
                    where: { phone: pending.newPhone },
                    select: { id: true },
                });

                if (existing && existing.id !== current.user.id) {
                    throw new PhoneChangeError(
                        "ამ ნომრის გამოყენება შეუძლებელია. მიუთითე სხვა ნომერი.",
                        422,
                    );
                }

                const profile = await tx.user.update({
                    where: { id: current.user.id },
                    data: {
                        phone: pending.newPhone,
                        phoneVerifiedAt: now,
                    },
                    select: profileSelect,
                });

                await tx.phoneChangeRequest.update({
                    where: { id: pending.id },
                    data: { usedAt: now },
                });

                await tx.phoneChangeRequest.updateMany({
                    where: {
                        userId: current.user.id,
                        usedAt: null,
                    },
                    data: { usedAt: now },
                });

                return {
                    ok: true as const,
                    profile,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.ReadCommitted,
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        if (!result.ok) {
            return phoneChangeJson(
                {
                    success: false,
                    message: result.message,
                },
                result.status,
            );
        }

        return phoneChangeJson({
            success: true,
            profile: {
                ...result.profile,
                emailVerifiedAt:
                    result.profile.emailVerifiedAt?.toISOString() ??
                    null,
                phoneVerifiedAt:
                    result.profile.phoneVerifiedAt?.toISOString() ??
                    null,
                createdAt: result.profile.createdAt.toISOString(),
                updatedAt: result.profile.updatedAt.toISOString(),
            },
        });
    } catch (cause: unknown) {
        if (
            cause instanceof Prisma.PrismaClientKnownRequestError &&
            cause.code === "P2002"
        ) {
            return phoneChangeJson(
                {
                    success: false,
                    message:
                        "ამ ნომრის გამოყენება შეუძლებელია. მიუთითე სხვა ნომერი.",
                },
                422,
            );
        }

        return phoneChangeFailure(cause);
    } finally {
        await prisma.$disconnect();
    }
}