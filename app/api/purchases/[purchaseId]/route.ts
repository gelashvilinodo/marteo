import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

import { updatePurchase } from "@/lib/purchases/update-purchase";
import { PurchaseEditError } from "@/lib/purchases/lock-purchase-for-edit";
import { PurchaseValidationError } from "@/lib/purchases/validate-purchases";

import {
    readPurchaseForm,
    PurchaseFormError,
} from "@/lib/purchases/read-purchase-form";
import { ProductImageError } from "@/lib/purchases/product-images";

function errorResponse(message: string, status: number) {
    return NextResponse.json(
        { success: false, error: message },
        {
            status,
            headers: { "Cache-Control": "no-store" },
        },
    );
}

function formatPurchaseDate(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tbilisi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")!.value;
    const month = parts.find((part) => part.type === "month")!.value;
    const day = parts.find((part) => part.type === "day")!.value;

    return `${year}-${month}-${day}`;
}

export async function GET(
    _request: Request,
    context: {
        params: Promise<{ purchaseId: string }>;
    },
) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;

    try {
        const user = await getCurrentUser();

        if (!user) {
            return errorResponse(
                "რედაქტირებისთვის შედი ანგარიშში.",
                401,
            );
        }

        const { purchaseId } = await context.params;

        if (!purchaseId || purchaseId.length > 100) {
            return errorResponse("პარტიის კოდი არასწორია.", 400);
        }

        prisma = createPrismaClient();

        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) {
            return errorResponse(
                "ბიზნესზე წვდომა ვერ მოიძებნა.",
                403,
            );
        }

        const purchase = await prisma.purchase.findFirst({
            where: {
                id: purchaseId,
                businessId: membership.businessId,
            },
            include: {
                items: {
                    orderBy: [
                        { createdAt: "asc" },
                        { id: "asc" },
                    ],
                    include: {
                        inventoryItem: {
                            include: {
                                product: true,
                            },
                        },
                    },
                },
            },
        });

        if (!purchase) {
            return errorResponse("პარტია ვერ მოიძებნა.", 404);
        }

        if (purchase.receiptStatus !== "IN_TRANSIT") {
            return errorResponse(
                "ამ ეტაპზე მხოლოდ გზაში მყოფი პარტიის რედაქტირებაა შესაძლებელი.",
                409,
            );
        }

        const missingPricing = purchase.items.some(
            (item) =>
                item.plannedPricingMethod === null ||
                item.plannedPricingValue === null,
        );

        if (missingPricing) {
            return errorResponse(
                "პარტიის პროდუქტზე გასაყიდი ფასის წესი არ არის შენახული.",
                409,
            );
        }

        return NextResponse.json(
            {
                success: true,
                purchase: {
                    id: purchase.id,
                    number: purchase.number,
                    updatedAt: purchase.updatedAt.toISOString(),

                    name: purchase.name ?? "",
                    note: purchase.note ?? "",
                    receiptStatus: purchase.receiptStatus,
                    purchaseDate: formatPurchaseDate(
                        purchase.purchaseDate,
                    ),

                    shippingCost: purchase.shippingCost.toString(),
                    customsCost: purchase.customsCost.toString(),
                    otherCost: purchase.otherCost.toString(),

                    items: purchase.items.map((item) => ({
                        purchaseItemId: item.id,
                        sourceInventoryItemId: item.inventoryItemId,
                        sourceProductId: item.inventoryItem.productId,

                        name: item.inventoryItem.product.name,
                        category:
                            item.inventoryItem.product.category ?? "",
                        brand: item.inventoryItem.product.brand ?? "",
                        description:
                            item.inventoryItem.product.description ?? "",
                        color: item.inventoryItem.color ?? "",
                        size: item.inventoryItem.size ?? "",
                        imageUrl: item.inventoryItem.imageUrl ?? "",

                        quantity: String(item.quantity),
                        defectiveQuantity: String(
                            item.defectiveQuantity,
                        ),
                        defectNote: item.defectNote ?? "",

                        unitPurchasePrice:
                            item.unitPurchasePrice.toString(),
                        pricingMethod: item.plannedPricingMethod,
                        pricingValue:
                            item.plannedPricingValue!.toString(),
                    })),
                },
            },
            {
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        console.error("Purchase edit data loading failed", error);

        return errorResponse(
            "პარტიის მონაცემები ვერ ჩაიტვირთა. სცადე ხელახლა.",
            500,
        );
    } finally {
        if (prisma) {
            await prisma.$disconnect();
        }
    }
}

export async function PATCH(
    request: Request,
    context: {
        params: Promise<{ purchaseId: string }>;
    },
) {
    try {
        if (
            request.headers.get("origin") !==
            new URL(request.url).origin
        ) {
            return errorResponse(
                "მოთხოვნის წყარო დაუშვებელია.",
                403,
            );
        }

        const user = await getCurrentUser();

        if (!user) {
            return errorResponse(
                "რედაქტირებისთვის შედი ანგარიშში.",
                401,
            );
        }

        const { purchaseId } = await context.params;
        const { payload, purchase, imageChanges } =
            await readPurchaseForm(request);

        if (
            typeof payload.expectedUpdatedAt !== "string" ||
            payload.expectedUpdatedAt.length > 40
        ) {
            return errorResponse(
                "პარტიის ვერსია არასწორია. გახსენი რედაქტირება თავიდან.",
                400,
            );
        }

        const updatedPurchase = await updatePurchase(
            purchaseId,
            payload.expectedUpdatedAt,
            purchase,
            imageChanges,
        );

        return NextResponse.json(
            {
                success: true,
                purchase: updatedPurchase,
            },
            {
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        if (
            error instanceof PurchaseEditError ||
            error instanceof PurchaseFormError
        ) {
            return errorResponse(error.message, error.status);
        }

        if (error instanceof PurchaseValidationError) {
            return errorResponse(error.message, 400);
        }

        if (error instanceof ProductImageError) {
            return errorResponse(error.message, 422);
        }

        console.error("Purchase update failed", error);

        return errorResponse(
            "შენახვის შედეგი ვერ დადასტურდა. ხელახლა გახსნამდე შეინარჩუნე შეყვანილი მონაცემები და გადაამოწმე პარტია.",
            500,
        );
    }
}