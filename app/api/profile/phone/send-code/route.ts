import { rateLimitResponse } from "@/lib/security/rate-limit";
import { randomInt } from "crypto";

import { createPrismaClient } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import {
    PHONE_CHANGE_MAX_ATTEMPTS,
    PHONE_CHANGE_RESEND_SECONDS,
    PhoneChangeError,
    phoneChangeFailure,
    phoneChangeJson,
    hashPhoneChangeCode,
    hashPhoneChangeValue,
    normalizeProfilePhone,
    readPhoneChangeBody,
    readPhoneChangeSession,
} from "@/lib/profile/phone-change";

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

        const authorization = body.authorization;
        const newPhone = normalizeProfilePhone(body.newPhone);
        const initial = await readPhoneChangeSession(prisma);
        const code = randomInt(100000, 1000000).toString();

        const delivery = await prisma.$transaction(
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
                    pending.usedAt !== null ||
                    pending.expiresAt <= now ||
                    pending.previousPhone !== current.user.phone ||
                    pending.passwordFingerprint !==
                        hashPhoneChangeValue(current.user.password)
                ) {
                    throw new PhoneChangeError(
                        "დადასტურების ვადა ამოიწურა ან ანგარიშის მონაცემები შეიცვალა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (pending.attempts >= PHONE_CHANGE_MAX_ATTEMPTS) {
                    throw new PhoneChangeError(
                        "კოდის მცდელობები ამოიწურა. თავიდან დაადასტურე პაროლი.",
                        409,
                    );
                }

                if (
                    newPhone === normalizeProfilePhone(current.user.phone)
                ) {
                    throw new PhoneChangeError(
                        "მიუთითე მიმდინარე ნომრისგან განსხვავებული ნომერი.",
                        422,
                    );
                }

                const existing = await tx.user.findUnique({
                    where: { phone: newPhone },
                    select: { id: true },
                });

                if (existing) {
                    throw new PhoneChangeError(
                        "ამ ნომრის გამოყენება შეუძლებელია. მიუთითე სხვა ნომერი.",
                        422,
                    );
                }

                const lastDelivery = await tx.phoneChangeRequest.findFirst({
                    where: {
                        userId: current.user.id,
                        lastSentAt: { not: null },
                    },
                    orderBy: { lastSentAt: "desc" },
                    select: { lastSentAt: true },
                });

                if (lastDelivery?.lastSentAt) {
                    const retryAfter = Math.ceil(
                        (
                            lastDelivery.lastSentAt.getTime() +
                            PHONE_CHANGE_RESEND_SECONDS * 1000 -
                            now.getTime()
                        ) / 1000,
                    );

                    if (retryAfter > 0) {
                        throw new PhoneChangeError(
                            "SMS-ის ხელახლა გაგზავნამდე ცოტა მოიცადე.",
                            429,
                            retryAfter,
                        );
                    }
                }

                await tx.phoneChangeRequest.update({
                    where: { id: pending.id },
                    data: {
                        newPhone,
                        codeHash: hashPhoneChangeCode(
                            authorization,
                            code,
                        ),
                        lastSentAt: now,
                    },
                });

                return {
                    expiresAt: pending.expiresAt,
                };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        const expiry = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Tbilisi",
        }).format(delivery.expiresAt);

        try {
            await sendSms({
                phone: newPhone,
                message:
                    `MARTEO: ნომრის შეცვლის კოდია ${code}. ` +
                    `მოქმედებს ${expiry}-მდე, თბილისის დროით.`,
            });
        } catch (deliveryError) {
            const limited = rateLimitResponse(deliveryError);
            if (limited) return limited;
            return phoneChangeJson(
                {
                    success: false,
                    codeRequested: true,
                    newPhone,
                    expiresAt: delivery.expiresAt.toISOString(),
                    retryAfter: PHONE_CHANGE_RESEND_SECONDS,
                    message:
                        "SMS-ის გაგზავნა ვერ დადასტურდა. თუ კოდი მიიღე, გამოიყენე მიღებული კოდი; სხვა შემთხვევაში ხელახლა გაგზავნე.",
                },
                502,
                PHONE_CHANGE_RESEND_SECONDS,
            );
        }

        return phoneChangeJson({
            success: true,
            newPhone,
            expiresAt: delivery.expiresAt.toISOString(),
            retryAfter: PHONE_CHANGE_RESEND_SECONDS,
        });
    } catch (cause: unknown) {
        return phoneChangeFailure(cause);
    } finally {
        await prisma.$disconnect();
    }
}