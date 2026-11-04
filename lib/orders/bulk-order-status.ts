import "server-only";
import { canManageBusinessArea } from "@/lib/business/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { findActiveMembership } from "@/lib/auth/active-business";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { numericQuantities } from "./quantity";
import { orderWithStock } from "./order-stock";
import { completeOrder, completionBalance } from "./complete-order";
import { OrderValidationError } from "./validate-order";
import { queueShippedSms } from "@/lib/sms/order-sms";

function fail(message: string, status = 400): never {
    throw new OrderValidationError(message, status);
}

const MAX_ORDERS = 200;

type Method = "CASH" | "BANK_TRANSFER" | "CARD";
type BulkPayment = { orderId: string; remaining: string; method: Method; bankName: string };

export type BulkStatusOrder = { id: string; label: string; customer: string };
export type BulkCompleteResult = {
    completed: BulkStatusOrder[];
    needsPayment: Array<BulkStatusOrder & { remaining: string }>;
    blocked: Array<BulkStatusOrder & { reason: string }>;
};

function label(order: { id: string; number: number | null }) {
    return order.number === null ? order.id : `#${String(order.number).padStart(4, "0")}`;
}

function customer(order: { recipientFirstName: string | null; recipientLastName: string | null; recipientPhone: string }) {
    return [order.recipientFirstName, order.recipientLastName].filter(Boolean).join(" ") || order.recipientPhone;
}

function payments(value: unknown): Map<string, BulkPayment> {
    if (value === undefined) return new Map();
    if (!Array.isArray(value) || value.length > MAX_ORDERS) fail("გადახდების სია არასწორია.", 422);
    const result = new Map<string, BulkPayment>();
    for (const raw of value) {
        const entry = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
        if (
            typeof entry.orderId !== "string" ||
            typeof entry.remaining !== "string" ||
            (entry.method !== "CASH" && entry.method !== "BANK_TRANSFER" && entry.method !== "CARD") ||
            (entry.bankName !== undefined && typeof entry.bankName !== "string") ||
            result.has(entry.orderId)
        ) {
            fail("გადახდის მონაცემი არასწორია.", 422);
        }
        result.set(entry.orderId, {
            orderId: entry.orderId,
            remaining: entry.remaining,
            method: entry.method,
            bankName: typeof entry.bankName === "string" ? entry.bankName : "",
        });
    }
    return result;
}

// მხოლოდ მონიშნული შეკვეთები; ველის გარეშე — ყველა შესაბამისი სტატუსის შეკვეთა.
function orderIds(value: unknown): string[] | null {
    if (value === undefined) return null;
    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.length > MAX_ORDERS ||
        value.some(id => typeof id !== "string" || !id) ||
        new Set(value).size !== value.length
    ) {
        fail("მონიშნული შეკვეთების სია არასწორია.", 422);
    }
    return value as string[];
}

// ყველა „მუშავდება“ შეკვეთა გადადის „გაგზავნილზე“, ან ყველა „გაგზავნილი“ — „დასრულებულზე“.
// დასრულებისას ავტომატურად სრულდება მხოლოდ ის, რასაც თანხა და თვითღირებულება აღარ აკლია;
// დანარჩენი ბრუნდება სიით, რომ მომხმარებელმა თანხის მიღება დაადასტუროს.
export async function bulkOrderStatus(raw: unknown) {
    const user = await getCurrentUser();
    if (!user) fail("გაიარე ავტორიზაცია.", 401);
    const body = typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
    if (body.action !== "ship" && body.action !== "complete") fail("მოქმედება არასწორია.", 422);
    const confirmed = payments(body.payments);
    const ids = orderIds(body.orderIds);

    const prisma = createPrismaClient();
    try {
        const membership = await findActiveMembership(prisma, user.id);
        if (!membership) fail("ბიზნესი ვერ მოიძებნა.", 403);
        if (!canManageBusinessArea(membership, "ORDERS")) {
            fail("ამ მოქმედების უფლება არ გაქვს.", 403);
        }
        const businessId = membership.businessId;

        if (body.action === "ship") {
            const shippedIds = await prisma.$transaction(async tx => {
                await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id"=${businessId} FOR UPDATE`;
                // დაბრუნების ისტორიის მქონე შეკვეთის სტატუსი მხოლოდ დაბრუნების მოქმედებით იცვლება.
                const rows = await tx.$queryRaw<{ id: string }[]>`
                    UPDATE "Order" o
                    SET status = 'SHIPPED', "invoiceVersion" = o."invoiceVersion" + 1, "updatedAt" = now()
                    WHERE o."businessId" = ${businessId}
                        AND o."deletedAt" IS NULL
                        AND o.status = 'PROCESSING'
                        ${ids ? Prisma.sql`AND o.id = ANY(${ids})` : Prisma.empty}
                        AND NOT EXISTS (
                            SELECT 1 FROM "OrderReturn" r
                            WHERE r."orderId" = o.id
                                AND r."fulfillmentCycle" = o."fulfillmentCycle"
                                AND r.status IN ('PENDING', 'RECEIVED')
                        )
                    RETURNING o.id
                `;
                return rows.map(row => row.id);
            }, { maxWait: 10000, timeout: 60000 });
            // გაგზავნილ შეკვეთებზე მყიდველებს SMS ფონურად მიდის.
            void queueShippedSms(businessId, shippedIds);
            return { shipped: shippedIds.length };
        }

        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id"=${businessId} FOR UPDATE`;
            const orders = await tx.order.findMany({
                where: {
                    businessId,
                    deletedAt: null,
                    status: "SHIPPED",
                    ...(confirmed.size
                        ? { id: { in: [...confirmed.keys()] } }
                        : ids ? { id: { in: ids } } : {}),
                },
                orderBy: [{ number: "asc" }, { id: "asc" }],
                take: MAX_ORDERS,
                include: {
                    ...orderWithStock,
                    returns: {
                        where: { status: "PENDING" },
                        select: { id: true },
                    },
                },
            }).then(numericQuantities);

            const result: BulkCompleteResult = { completed: [], needsPayment: [], blocked: [] };

            for (const order of orders) {
                const base = { id: order.id, label: label(order), customer: customer(order) };
                if (order.deleteRequestedAt || order.stockReturnedAt || order.returns.length > 0) {
                    result.blocked.push({ ...base, reason: "დაბრუნება ან წაშლა მიმდინარეობს. გახსენი შეკვეთა." });
                    continue;
                }
                if (order.paymentStatus === "UNKNOWN") {
                    result.blocked.push({ ...base, reason: "გადახდა დაუზუსტებელია. გახსენი და მიუთითე რეალურად გადახდილი თანხა." });
                    continue;
                }

                const { receivedQuantities, remaining } = await completionBalance(tx, order);
                const missingCosts = order.items.some(item =>
                    item.source === "MANUAL" &&
                    item.totalCost === null &&
                    !item.stockRestoredAt &&
                    item.quantity > (receivedQuantities.get(item.id) ?? 0),
                );
                if (missingCosts) {
                    result.blocked.push({ ...base, reason: "ხელით დამატებულ პროდუქტს თვითღირებულება აკლია. გახსენი და დაასრულე ცალკე." });
                    continue;
                }

                const payment = confirmed.get(order.id);
                if (remaining.gt(0)) {
                    if (!payment) {
                        result.needsPayment.push({ ...base, remaining: remaining.toFixed(2) });
                        continue;
                    }
                    // თანხა დადასტურების შემდეგ შეიცვალა: ხელახლა ვაჩვენებთ.
                    if (payment.remaining !== remaining.toFixed(2)) {
                        result.needsPayment.push({ ...base, remaining: remaining.toFixed(2) });
                        continue;
                    }
                }

                try {
                    await completeOrder(tx, businessId, order, payment
                        ? {
                            confirmFullPayment: true,
                            completionPaymentMethod: payment.method,
                            completionBankName: payment.bankName,
                        }
                        : {});
                    result.completed.push(base);
                } catch (cause: unknown) {
                    if (!(cause instanceof OrderValidationError)) throw cause;
                    result.blocked.push({ ...base, reason: cause.message });
                }
            }

            return result;
        }, { maxWait: 10000, timeout: 120000 });
    } finally { await prisma.$disconnect(); }
}
