import { Prisma } from "@/generated/prisma/client";
import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import {
    InventoryEditError,
    validateInventoryEdit,
} from "@/lib/inventory/validate-inventory-edit";
import { saveProductAttributes } from "@/lib/purchases/save-product-attributes";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

type RouteContext = {
    params: Promise<{ inventoryItemId: string }>;
};

async function handle(
    request: Request,
    routeContext: RouteContext,
    editing: boolean,
) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;

    try {
        if (editing) {
            if (
                request.headers.get("origin") !==
                new URL(request.url).origin
            ) {
                throw new InventoryEditError(
                    "მოთხოვნის წყარო დაუშვებელია.",
                    403,
                );
            }

            if (
                request.headers
                    .get("content-type")
                    ?.split(";")[0]
                    .trim()
                    .toLowerCase() !== "application/json"
            ) {
                throw new InventoryEditError(
                    "მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.",
                    415,
                );
            }
        }

        const context = await getPgDashboardContext();

        if (!context) {
            throw new InventoryEditError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        if (!context.membership) {
            throw new InventoryEditError(
                "ბიზნესზე წვდომა ვერ მოიძებნა.",
                403,
            );
        }

        const { inventoryItemId } = await routeContext.params;

        if (!inventoryItemId || inventoryItemId.length > 100) {
            throw new InventoryEditError(
                "პროდუქტის კოდი არასწორია.",
            );
        }

        let body: unknown;

        if (editing) {
            try {
                body = await request.json();
            } catch {
                throw new InventoryEditError(
                    "მოთხოვნის ფორმატი არასწორია.",
                );
            }
        }

        const input = editing
            ? validateInventoryEdit(body)
            : null;

        const businessId = context.membership.businessId;
        const userId = context.user.id;

        prisma = createPrismaClient();

        const data = await prisma.$transaction(
            async tx => {
                // იგივე ბიზნესზე გაყიდვასა და პარტიის
                // ცვლილებასთან ერთდროული ჩაწერა იზღუდება.
                if (editing) {
                    await tx.$queryRaw`
                        SELECT id FROM "Business"
                        WHERE id = ${businessId}
                        FOR UPDATE
                    `;
                } else {
                    await tx.$queryRaw`
                        SELECT id FROM "Business"
                        WHERE id = ${businessId}
                        FOR SHARE
                    `;
                }

                const membership =
                    await tx.businessMembership.findFirst({
                        where: { businessId, userId },
                        select: { id: true },
                    });

                if (!membership) {
                    throw new InventoryEditError(
                        "ამ ბიზნესზე წვდომა აღარ გაქვს.",
                        403,
                    );
                }

                const item = await tx.inventoryItem.findFirst({
                    where: {
                        id: inventoryItemId,
                        businessId,
                        isActive: true,
                        product: { businessId },
                    },
                    include: { product: true },
                });

                if (!item) {
                    throw new InventoryEditError(
                        "პროდუქტი ვერ მოიძებნა ან აღარ არის აქტიური.",
                        404,
                    );
                }

                if (!input) {
                    return {
                        id: item.id,
                        expectedInventoryUpdatedAt:
                            item.updatedAt.toISOString(),
                        expectedProductUpdatedAt:
                            item.product.updatedAt.toISOString(),
                        name: item.product.name,
                        brand: item.product.brand ?? "",
                        category: item.product.category ?? "",
                        description: item.product.description ?? "",
                        color: item.color ?? "",
                        size: item.size ?? "",
                        imageUrl: item.imageUrl ?? "",
                        salePrice: item.salePrice?.toFixed(2) ?? "",
                    };
                }

                if (
                    item.updatedAt.toISOString() !==
                        input.expectedInventoryUpdatedAt ||
                    item.product.updatedAt.toISOString() !==
                        input.expectedProductUpdatedAt
                ) {
                    throw new InventoryEditError(
                        "პროდუქტი უკვე შეიცვალა. შეინარჩუნე შეყვანილი მონაცემები და გახსენი რედაქტირება ხელახლა.",
                        409,
                    );
                }

                // ახალი ფოტოს ატვირთვას შემდეგ ეტაპზე
                // არსებული ატვირთვის მექანიზმით დავაკავშირებთ.
                if (
                    input.imageUrl !== null &&
                    input.imageUrl !== item.imageUrl
                ) {
                    throw new InventoryEditError(
                        "ახალი ფოტო ჯერ ატვირთვის ფორმიდან უნდა დაემატოს.",
                    );
                }

                const attributes = await saveProductAttributes(
                    tx,
                    businessId,
                    {
                        brand: input.brand ?? "",
                        category: input.category ?? "",
                        color: input.color ?? "",
                        size: input.size ?? "",
                    },
                );

                const productData = {
                    name: input.name,
                    brand: attributes.brand || null,
                    category: attributes.category || null,
                    description: input.description,
                };

                const metadataChanged =
                    item.product.name !== productData.name ||
                    item.product.brand !== productData.brand ||
                    item.product.category !== productData.category ||
                    item.product.description !==
                        productData.description;

                // ვერსია ყოველთვის წინ მიდის, მათ შორის
                // ძალიან სწრაფი განმეორებითი შენახვისას.
                const updatedAt = new Date(
                    Math.max(
                        Date.now(),
                        item.updatedAt.getTime() + 1,
                        item.product.updatedAt.getTime() + 1,
                    ),
                );

                let productId = item.productId;

                if (metadataChanged) {
                    const anotherVariant =
                        await tx.inventoryItem.findFirst({
                            where: {
                                productId: item.productId,
                                id: { not: item.id },
                            },
                            select: { id: true },
                        });

                    if (anotherVariant) {
                        // საერთო პროდუქტის შეცვლის ნაცვლად
                        // მხოლოდ არჩეულ ვარიანტს გამოვყოფთ.
                        const product = await tx.product.create({
                            data: {
                                businessId,
                                ...productData,
                                updatedAt,
                            },
                            select: { id: true },
                        });

                        productId = product.id;
                    } else {
                        await tx.product.update({
                            where: { id: productId },
                            data: {
                                ...productData,
                                updatedAt,
                            },
                        });
                    }
                }

                const priceChanged =
                    (item.salePrice?.toFixed(2) ?? null) !==
                    input.salePrice;

                await tx.inventoryItem.update({
                    where: { id: item.id },
                    data: {
                        productId,
                        color: attributes.color || null,
                        size: attributes.size || null,
                        imageUrl: input.imageUrl,
                        updatedAt,
                        ...(priceChanged
                            ? {
                                salePrice: input.salePrice === null
                                    ? null
                                    : new Prisma.Decimal(
                                        input.salePrice,
                                    ),
                                pricingMethod:
                                    input.salePrice === null
                                        ? null
                                        : "MANUAL",
                                pricingValue:
                                    input.salePrice === null
                                        ? null
                                        : new Prisma.Decimal(
                                            input.salePrice,
                                        ),
                            }
                            : {}),
                    },
                });

                return { id: item.id };
            },
            {
                maxWait: 10000,
                timeout: 20000,
            },
        );

        return json({ success: true, data });
    } catch (cause: unknown) {
        if (cause instanceof InventoryEditError) {
            return json(
                { success: false, message: cause.message },
                cause.status,
            );
        }

        console.error(
            "Inventory edit failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json(
            {
                success: false,
                message: editing
                    ? "შენახვის შედეგი ვერ დადასტურდა. შეინარჩუნე შეყვანილი მონაცემები და გადაამოწმე პროდუქტი."
                    : "პროდუქტის მონაცემები ვერ ჩაიტვირთა. სცადე ხელახლა.",
            },
            500,
        );
    } finally {
        await prisma?.$disconnect();
    }
}

export async function GET(
    request: Request,
    context: RouteContext,
) {
    return handle(request, context, false);
}

export async function PATCH(
    request: Request,
    context: RouteContext,
) {
    return handle(request, context, true);
}