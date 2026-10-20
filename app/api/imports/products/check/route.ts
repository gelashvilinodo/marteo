import { getCurrentUser } from "@/lib/auth/session";
import {
    getCurrentBusiness,
} from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    readImportJson,
} from "@/lib/imports/read-import-json";
import {
    checkExistingProducts,
} from "@/lib/imports/check-existing-products";
import type {
    ProductMatchQuery,
} from "@/lib/imports/match-import-products";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function nullableText(
    value: unknown,
    label: string,
): string | null {
    if (value === null || value === undefined) return null;

    if (
        typeof value !== "string" ||
        value.includes("\0")
    ) {
        fail(`${label}: ტექსტის ფორმატი არასწორია.`);
    }

    return value.trim() || null;
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();

        if (!user) fail("გაიარე ავტორიზაცია.", 401);

        const membership = await getCurrentBusiness();

        if (!membership) {
            fail("ბიზნესი ვერ მოიძებნა.", 403);
        }

        const prisma = createPrismaClient();

        try {
            const access =
                await prisma.businessMembership.findUnique({
                    where: {
                        userId_businessId: {
                            userId: user.id,
                            businessId: membership.businessId,
                        },
                    },
                    select: { role: true },
                });

            if (
                !access ||
                !["OWNER", "ADMIN"].includes(access.role)
            ) {
                fail(
                    "იმპორტის შემოწმება ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                    403,
                );
            }

            const raw = await readImportJson(
                request,
                1024 * 1024,
            );

            if (
                typeof raw !== "object" ||
                raw === null ||
                Array.isArray(raw)
            ) {
                fail("შემოწმების მოთხოვნის ფორმატი არასწორია.");
            }

            const body = raw as Record<string, unknown>;

            if (
                !Array.isArray(body.queries) ||
                body.queries.length > 100
            ) {
                fail(
                    "ერთ მოთხოვნაში მაქსიმუმ 100 პროდუქტის შემოწმებაა შესაძლებელი. მეტი ჩანაწერი ნაწილებად უნდა შემოწმდეს.",
                );
            }

            const keys = new Set<string>();

            const queries = body.queries.map(
                (value: unknown): ProductMatchQuery => {
                    if (
                        typeof value !== "object" ||
                        value === null ||
                        Array.isArray(value)
                    ) {
                        fail(
                            "პროდუქტის შემოწმების მონაცემები არასწორია.",
                        );
                    }

                    const item =
                        value as Record<string, unknown>;

                    const key = nullableText(
                        item.key,
                        "ჩანაწერი",
                    );

                    const name = nullableText(
                        item.name,
                        "პროდუქტის სახელი",
                    );

                    if (!key || !name || keys.has(key)) {
                        fail(
                            "პროდუქტის სახელი ან უნიკალური სამუშაო იდენტიფიკატორი აკლია.",
                        );
                    }

                    keys.add(key);

                    return {
                        key,
                        name,
                        sourceCode: nullableText(
                            item.sourceCode,
                            "კოდი",
                        ),
                        brand: nullableText(
                            item.brand,
                            "ბრენდი",
                        ),
                        color: nullableText(
                            item.color,
                            "ფერი",
                        ),
                        size: nullableText(
                            item.size,
                            "ზომა",
                        ),
                    };
                },
            );

            const snapshot = await checkExistingProducts({
                prisma,
                businessId: membership.businessId,
                queries,
            });

            return json({
                success: true,
                ...snapshot,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) {
            return json(
                {
                    success: false,
                    message: cause.message,
                },
                cause.status,
            );
        }

        console.error(
            "Import product check failed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );

        return json(
            {
                success: false,
                message:
                    "არსებული პროდუქტების შემოწმება ვერ დასრულდა. ეს ფაილის შეცდომას არ ნიშნავს. მონაცემები არ შეცვლილა — სცადე ხელახლა.",
            },
            500,
        );
    }
}