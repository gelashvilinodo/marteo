import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { orderJson, orderError } from "@/lib/orders/order-http";
import { getOrderMovementDetail } from "@/lib/analytics/get-order-movement-detail";

export async function GET(request: Request) {
    if (!(await getCurrentUser())) {
        return orderJson(
            { success: false, message: "გაიარე ავტორიზაცია." },
            401,
        );
    }

    const membership = await getCurrentBusiness();

    if (!membership) {
        return orderJson(
            { success: false, message: "ბიზნესი ვერ მოიძებნა." },
            403,
        );
    }

    const key = new URL(request.url).searchParams.get("key") ?? "";
    const match = /^(financial|payment|expense|purchase):([^:]+)$/.exec(key);

    if (!match) {
        return orderJson(
            { success: false, message: "ჩანაწერის კოდი არასწორია." },
            400,
        );
    }

    const [, source, id] = match;
    const businessId = membership.businessId;
    const prisma = createPrismaClient();

    const missing = () =>
        orderJson(
            { success: false, message: "ჩანაწერი ვერ მოიძებნა." },
            404,
        );

    try {
        if (source === "expense") {
            const expense = await prisma.expense.findFirst({
                where: { id, businessId },
                select: {
                    id: true,
                    category: true,
                    title: true,
                    note: true,
                    amount: true,
                    expenseDate: true,
                    updatedAt: true,
                },
            });

            if (!expense) return missing();

            return orderJson({
                success: true,
                detail: {
                    source,
                    ...expense,
                    amount: expense.amount.negated().toFixed(2),
                    occurredAt: expense.expenseDate.toISOString(),
                    updatedAt: expense.updatedAt.toISOString(),
                    editable: true,
                },
            });
        }

        if (source === "purchase") {
            const purchase = await prisma.purchase.findFirst({
                where: { id, businessId },
                select: {
                    id: true,
                    number: true,
                    name: true,
                    supplierName: true,
                    note: true,
                    purchaseDate: true,
                    shippingCost: true,
                    customsCost: true,
                    otherCost: true,
                    items: {
                        select: {
                            quantity: true,
                            unitPurchasePrice: true,
                        },
                    },
                },
            });

            if (!purchase) return missing();

            const productsTotal = purchase.items.reduce(
                (total, item) =>
                    total.plus(
                        item.unitPurchasePrice.mul(item.quantity),
                    ),
                new Prisma.Decimal(0),
            );

            const total = productsTotal
                .plus(purchase.shippingCost)
                .plus(purchase.customsCost)
                .plus(purchase.otherCost);

            return orderJson({
                success: true,
                detail: {
                    source,
                    id: purchase.id,
                    number: purchase.number,
                    title: purchase.name ?? "პარტიის შეძენა",
                    supplierName: purchase.supplierName,
                    note: purchase.note,
                    occurredAt: purchase.purchaseDate.toISOString(),
                    productsTotal: productsTotal.toFixed(2),
                    shippingCost: purchase.shippingCost.toFixed(2),
                    customsCost: purchase.customsCost.toFixed(2),
                    otherCost: purchase.otherCost.toFixed(2),
                    amount: total.negated().toFixed(2),
                    editable: false,
                },
            });
        }

        const params = Object.fromEntries(
            new URL(request.url).searchParams.entries(),
        );

        const detail = await getOrderMovementDetail(
            prisma,
            businessId,
            source as "financial" | "payment",
            id,
            params,
        );

        if (!detail) return missing();

        return orderJson({
            success: true,
            detail,
        });
    } catch (cause: unknown) {
        return orderError(cause);
    } finally {
        await prisma.$disconnect();
    }
}