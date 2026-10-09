import { Prisma } from "@/generated/prisma/client";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

const PAGE_SIZE = 20;

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

export async function GET(request: Request) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;

    try {
        const user = await getCurrentUser();

        if (!user) {
            return json(
                {
                    success: false,
                    message: "გაიარე ავტორიზაცია.",
                },
                401,
            );
        }

        const url = new URL(request.url);

        const query = (
            url.searchParams.get("q") ?? ""
        ).trim();

        const rawPage = Number(
            url.searchParams.get("page") ?? "1",
        );

        const requestedPage =
            Number.isSafeInteger(rawPage) && rawPage > 0
                ? rawPage
                : 1;

        prisma = createPrismaClient();

        const membership =
            await prisma.businessMembership.findFirst({
                where: { userId: user.id },
                orderBy: { createdAt: "asc" },
                select: { businessId: true },
            });

        if (!membership) {
            return json(
                {
                    success: false,
                    message: "ბიზნესი ვერ მოიძებნა.",
                },
                403,
            );
        }

        const businessId = membership.businessId;

        const searchConditions:
            Prisma.InventoryItemWhereInput[] = query
                .split(/\s+/)
                .filter(Boolean)
                .map((word) => ({
                    OR: [
                        {
                            sku: {
                                contains: word,
                                mode: "insensitive",
                            },
                        },
                        {
                            color: {
                                contains: word,
                                mode: "insensitive",
                            },
                        },
                        {
                            size: {
                                contains: word,
                                mode: "insensitive",
                            },
                        },
                        {
                            product: {
                                name: {
                                    contains: word,
                                    mode: "insensitive",
                                },
                            },
                        },
                        {
                            product: {
                                brand: {
                                    contains: word,
                                    mode: "insensitive",
                                },
                            },
                        },
                        {
                            product: {
                                category: {
                                    contains: word,
                                    mode: "insensitive",
                                },
                            },
                        },
                    ],
                }));

        const where: Prisma.InventoryItemWhereInput = {
            businessId,
            isActive: true,
            currentStock: { gt: 0 },
            product: { businessId },
            purchaseItems: {
                some: {
                    purchase: {
                        businessId,
                        receiptStatus: "RECEIVED",
                    },
                },
            },
            ...(searchConditions.length > 0
                ? { AND: searchConditions }
                : {}),
        };

        const result = await prisma.$transaction(
            async (tx) => {
                const totalProducts =
                    await tx.inventoryItem.count({
                        where,
                    });

                const totalPages = Math.max(
                    1,
                    Math.ceil(totalProducts / PAGE_SIZE),
                );

                const currentPage = Math.min(
                    requestedPage,
                    totalPages,
                );

                const products =
                    await tx.inventoryItem.findMany({
                        where,
                        skip:
                            (currentPage - 1) * PAGE_SIZE,
                        take: PAGE_SIZE,
                        orderBy: [
                            { product: { name: "asc" } },
                            { productId: "asc" },
                            { color: "asc" },
                            { size: "asc" },
                            { id: "asc" },
                        ],
                        select: {
                            id: true,
                            sku: true,
                            color: true,
                            size: true,
                            imageUrl: true,
                            salePrice: true,
                            currentStock: true,
                            product: {
                                select: {
                                    name: true,
                                    brand: true,
                                    category: true,
                                    description: true,
                                },
                            },
                        },
                    });

                const defectiveBalances =
                    products.length > 0
                        ? await tx.purchaseItem.groupBy({
                              by: ["inventoryItemId"],
                              where: {
                                  inventoryItemId: {
                                      in: products.map(
                                          (product) =>
                                              product.id,
                                      ),
                                  },
                                  purchase: {
                                      businessId,
                                      receiptStatus:
                                          "RECEIVED",
                                  },
                              },
                              _sum: {
                                  remainingDefectiveQuantity:
                                      true,
                              },
                          })
                        : [];

                const defectiveById = new Map(
                    defectiveBalances.map((balance) => [
                        balance.inventoryItemId,
                        balance._sum
                            .remainingDefectiveQuantity ?? 0,
                    ]),
                );

                return {
                    products: products.map((product) => {
                        const defectiveStock =
                            defectiveById.get(product.id) ??
                            0;

                        return {
                            id: product.id,
                            sku: product.sku,
                            name: product.product.name,
                            brand:
                                product.product.brand ?? "",
                            category:
                                product.product.category ??
                                "",
                            description:
                                product.product
                                    .description ?? "",
                            color: product.color ?? "",
                            size: product.size ?? "",
                            imageUrl: product.imageUrl,
                            salePrice:
                                product.salePrice
                                    ?.toFixed(2) ?? null,
                            totalStock:
                                product.currentStock,
                            goodStock:
                                product.currentStock -
                                defectiveStock,
                            defectiveStock,
                        };
                    }),
                    totalProducts,
                    currentPage,
                    totalPages,
                    pageSize: PAGE_SIZE,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel
                        .RepeatableRead,
                maxWait: 10000,
                timeout: 15000,
            },
        );

        return json({
            success: true,
            ...result,
        });
    } catch (error: unknown) {
        console.error(
            "Order inventory lookup error",
            error,
        );

        return json(
            {
                success: false,
                message:
                    "მარაგის პროდუქტების ჩატვირთვა ვერ მოხერხდა.",
            },
            500,
        );
    } finally {
        if (prisma) {
            await prisma.$disconnect();
        }
    }
}