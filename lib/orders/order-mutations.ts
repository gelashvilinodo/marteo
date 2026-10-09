import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError, validateOrder } from "./validate-order";
import { assertTransition, assertVersion, fingerprint, paymentState, type OrderState } from "./order-rules";
import { createOrderItems, orderWithStock, resolveOrderCustomer, restoreOrderStock } from "./order-stock";
import { createPublicOrderToken } from "./create-public-order-token";
import { exchangeOrderProducts } from "./order-exchanges";
import { confirmOrderRefund } from "./order-refunds";
import {
    requestOrderReturn,
    receiveOrderReturn,
    type ReturnSelection,
} from "./order-returns";

export type MutationKind =
    | "edit"
    | "status"
    | "return"
    | "delete"
    | "link"
    | "exchange"
    | "refund"
    | "cancel-deletion";
function fail(message: string, status = 400): never { throw new OrderValidationError(message, status); }
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("მონაცემების ფორმატი არასწორია.");
    return value as Record<string, unknown>;
}
function state(value: unknown): OrderState {
    if (value !== "PROCESSING" && value !== "SHIPPED" && value !== "COMPLETED" && value !== "CANCELED") fail("სტატუსი არასწორია.");
    return value;
}
export async function mutateOrder(orderId: string, kind: MutationKind, raw: unknown) {
    const user = await getCurrentUser();
    if (!user) fail("გაიარე ავტორიზაცია.", 401);
    const body = object(raw);
    if (typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) fail("მოთხოვნის კოდი არასწორია.");
    const requestId = body.requestId.toLowerCase();
    const hash = await fingerprint({ kind, body });
    const prisma = createPrismaClient();
    try {
        const membership = await prisma.businessMembership.findFirst({ where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { businessId: "asc" }], select: { businessId: true } });
        if (!membership) fail("ბიზნესი ვერ მოიძებნა.", 403);
        const businessId = membership.businessId;
        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id"=${businessId} FOR UPDATE`;
            const order = await tx.order.findFirst({ where: { id: orderId, businessId }, include: orderWithStock });
            if (!order) fail("შეკვეთა ვერ მოიძებნა.", 404);
            const previous = await tx.orderMutation.findUnique({ where: { orderId_requestId: { orderId, requestId } } });
            if (previous) {
                if (previous.fingerprint !== hash) fail("იგივე მოთხოვნის კოდი განსხვავებულ მონაცემებზე გამოიყენე. შექმენი ახალი მოთხოვნა.", 409);
                return previous.result;
            }
            if (order.deletedAt) fail("შეკვეთა წაშლილია.", 404);
            assertVersion(order.invoiceVersion, body.expectedVersion);
            const hasReturnHistory = await tx.orderReturn.count({
                where: {
                    orderId,
                    fulfillmentCycle: order.fulfillmentCycle,
                    status: { in: ["PENDING", "RECEIVED"] },
                },
            });

            if (
                hasReturnHistory > 0 &&
                (kind === "edit" || kind === "status")
            ) {
                const pendingReturns = await tx.orderReturn.count({
                    where: {
                        orderId,
                        fulfillmentCycle: order.fulfillmentCycle,
                        status: "PENDING",
                    },
                });

                const completingAfterReturn =
                    kind === "status" &&
                    body.status === "COMPLETED" &&
                    order.status === "SHIPPED" &&
                    pendingReturns === 0 &&
                    !order.deleteRequestedAt &&
                    !order.stockReturnedAt;

                if (!completingAfterReturn) {
                    fail(
                        "ამ შეკვეთაზე დაბრუნება მიმდინარეობს ან უკვე აღრიცხულია. გამოიყენე დაბრუნების შესაბამისი მოქმედება.",
                        409,
                    );
                }
            }
            let changed = false;
            let refundSummary:
                | Awaited<ReturnType<typeof confirmOrderRefund>>
                | undefined;
            let exchangeSummary:
                | Awaited<ReturnType<typeof exchangeOrderProducts>>
                | undefined;
            if (kind === "edit") {
                if (order.status === "COMPLETED" || order.status === "RETURNED") {
                    fail("ამ შეკვეთაზე გამოიყენე გადაცვლის შესაბამისი მოქმედება.", 409);
                }
                const data = validateOrder({ ...object(body.order), clientRequestId: requestId, status: order.status }, "edit");
                if (order.status !== "PROCESSING") {
                    // გაგზავნილ/გაუქმებულ შეკვეთაზე იცვლება კლიენტის ინფორმაცია და გადახდა.
                    const same = data.items.length === order.items.length && data.items.every((item, index) => {
                        const old = order.items[index];
                        return item.source === old.source && item.inventoryItemId === old.inventoryItemId && item.condition === old.condition && item.name === old.name &&
                            (item.source !== "MANUAL" || item.imageUrl === old.imageUrl) &&
                            item.quantity === old.quantity && item.description === (old.description ?? "") && item.color === (old.color ?? "") && item.size === (old.size ?? "") && item.unitPrice.eq(old.unitPrice) && (item.source !== "MANUAL" || item.unitCost?.eq(old.unitCost));
                    });
                    if (!same || !data.courierFee.eq(order.courierFee)) fail("გაგზავნილ ან გაუქმებულ შეკვეთაში პროდუქტები, რაოდენობა და ფასი აღარ იცვლება.", 409);
                } else {
                    const carriedItems = order.items.filter(
                        item => item.isCarriedOver,
                    );

                    const carriedIds = new Set(
                        carriedItems.map(item => item.id),
                    );

                    // კლიენტთან დარჩენილი ნივთები უცვლელად უნდა შენარჩუნდეს.
                    for (const old of carriedItems) {
                        const matches = data.items.filter(
                            item => item.orderItemId === old.id,
                        );

                        const item = matches[0];

                        const unchanged =
                            matches.length === 1 &&
                            item &&
                            item.source === old.source &&
                            item.inventoryItemId === old.inventoryItemId &&
                            item.condition === old.condition &&
                            item.name === old.name &&
                            item.quantity === old.quantity &&
                            item.description === (old.description ?? "") &&
                            item.color === (old.color ?? "") &&
                            item.size === (old.size ?? "") &&
                            item.unitPrice.eq(old.unitPrice) &&
                            (
                                item.source !== "MANUAL" ||
                                (
                                    item.imageUrl === old.imageUrl &&
                                    item.unitCost?.eq(old.unitCost)
                                )
                            );

                        if (!unchanged) {
                            fail(
                                "კლიენტთან დარჩენილი პროდუქტი ამ ფორმიდან არ იცვლება. გამოიყენე დაბრუნება ან გადაცვლა.",
                                409,
                            );
                        }
                    }

                    const replacementItems = data.items.filter(
                        item =>
                            !item.orderItemId ||
                            !carriedIds.has(item.orderItemId),
                    );

                    // მარაგში აღდგება მხოლოდ ჯერ გასაგზავნი ნივთები.
                    await restoreOrderStock(
                        tx,
                        order,
                        "რედაქტირებისას ძველი პროდუქტის დაბრუნება",
                        false,
                    );

                    // ძველ ჩანაწერებს ვინარჩუნებთ მარაგის მოძრაობების ისტორიისთვის.
                    await tx.orderItem.updateMany({
                        where: {
                            orderId,
                            isActive: true,
                            isCarriedOver: false,
                        },
                        data: {
                            isActive: false,
                        },
                    });

                    const ids = [
                        ...new Set(
                            replacementItems.flatMap(
                                item =>
                                    item.inventoryItemId
                                        ? [item.inventoryItemId]
                                        : [],
                            ),
                        ),
                    ].sort();

                    if (ids.length) {
                        await tx.$queryRaw(
                            Prisma.sql`
            SELECT "id"
            FROM "InventoryItem"
            WHERE "businessId" = ${businessId}
              AND "id" IN (${Prisma.join(ids)})
            ORDER BY "id"
            FOR UPDATE
        `,
                        );
                    }

                    // მხოლოდ ახალი გასაგზავნი პროდუქტები გამოაკლდება მარაგს.
                    await createOrderItems(
                        tx,
                        businessId,
                        orderId,
                        replacementItems,
                        order.fulfillmentCycle,
                    );
                }
                const customer = await resolveOrderCustomer(
                    tx,
                    businessId,
                    data,
                    false,
                );
                const total = data.items.reduce((sum, item) => sum.plus(item.unitPrice.mul(item.quantity)), data.courierFee);
                const paidBefore = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
                const delta = data.paidAmount.minus(paidBefore);
                if (delta.isNegative()) {
                    fail(
                        "გადახდილი თანხის შემცირებისთვის გამოიყენე თანხის დაბრუნების დადასტურება.",
                        409,
                    );
                }

                if (
                    delta.greaterThan(0) &&
                    data.paidAmount.greaterThan(total)
                ) {
                    fail(
                        "ახალი გადახდა დარჩენილ გადასახდელ თანხას აღემატება.",
                        422,
                    );
                }

                if (delta.greaterThan(0)) {
                    await tx.orderPayment.create({
                        data: {
                            orderId,
                            amount: delta,
                            method: data.paymentMethod,
                            bankName: data.bankName || null,
                        },
                    });
                }
                await tx.order.update({
                    where: { id: orderId }, data: {
                        customerId: customer.id, recipientPhone: data.recipientPhone,
                        recipientFirstName: data.recipientFirstName || null, recipientLastName: data.recipientLastName || null,
                        shippingAddress: data.shippingAddress || null, courierFee: data.courierFee,
                        paymentStatus: paymentState(total, data.paidAmount, data.courierFee), invoiceVersion: { increment: 1 },
                    }
                });
                changed = true;
            } else if (kind === "status") {
                const next = state(body.status);
                assertTransition(order.status, next, body.confirmCompleted);
                if (next !== order.status) {
                    const returnStock = next === "CANCELED" && (order.status === "PROCESSING" || body.stockReturned === true);
                    const fullyRestored = returnStock
                        ? await restoreOrderStock(
                            tx,
                            order,
                            "შეკვეთის გაუქმება და დაბრუნება",
                        )
                        : false;
                    await tx.order.update({
                        where: { id: orderId }, data: {
                            status: next, invoiceVersion: { increment: 1 },
                            ...(fullyRestored ? { stockReturnedAt: new Date() } : {}),
                        }
                    });
                    changed = true;
                }
            } else if (kind === "return") {
                if (body.action === "request") {
                    if (!Array.isArray(body.items)) {
                        fail("აირჩიე დასაბრუნებელი პროდუქტები.", 422);
                    }

                    await requestOrderReturn(
                        tx,
                        businessId,
                        orderId,
                        body.items as ReturnSelection[],
                        body.deleteAfterReturn === true,
                    );

                    changed = true;
                } else if (body.action === "receive") {
                    if (
                        typeof body.returnId !== "string" ||
                        !body.returnId.trim()
                    ) {
                        fail("დაბრუნების მოთხოვნის კოდი აკლია.", 422);
                    }

                    if (body.confirmReceived !== true) {
                        fail(
                            "დაადასტურე, რომ მონიშნული პროდუქტები ფიზიკურად მიიღე.",
                            422,
                        );
                    }

                    const result = await receiveOrderReturn(
                        tx,
                        businessId,
                        orderId,
                        body.returnId,
                    );

                    changed = !result.alreadyReceived;
                } else {
                    // ძველი სრული დაბრუნება რჩება მხოლოდ იმ შეკვეთებისთვის,
                    // რომლებსაც ახალი დაბრუნების ისტორია არ აქვთ.
                    if (hasReturnHistory > 0) {
                        fail(
                            "ამ შეკვეთაზე გამოიყენე კონკრეტული დაბრუნების მოთხოვნის დადასტურება.",
                            409,
                        );
                    }

                    if (order.status !== "CANCELED") {
                        fail(
                            "მარაგში დაბრუნება მხოლოდ გაუქმებული შეკვეთისთვისაა შესაძლებელი.",
                            409,
                        );
                    }

                    if (body.stockReturned !== true) {
                        fail(
                            "დაადასტურე, რომ პროდუქტი ფიზიკურად დაბრუნდა.",
                            422,
                        );
                    }

                    if (!order.stockReturnedAt) {
                        await restoreOrderStock(
                            tx,
                            order,
                            "გაუქმებული შეკვეთის მოგვიანებით დაბრუნება",
                        );

                        await tx.order.update({
                            where: { id: orderId },
                            data: {
                                stockReturnedAt: new Date(),
                                invoiceVersion: { increment: 1 },
                            },
                        });

                        changed = true;
                    }
                }
            } else if (kind === "delete") {
                if (body.confirmDeletion !== true) {
                    fail("დაადასტურე შეკვეთის წაშლის მოთხოვნა.", 422);
                }

                const pendingReturns = await tx.orderReturn.count({
                    where: { orderId, status: "PENDING" },
                });

                if (body.mode === "WAIT_FOR_RETURN") {
                    const hasCarriedOverItems = order.items.some(
                        item => item.isCarriedOver && !item.stockRestoredAt,
                    );

                    if (
                        order.stockReturnedAt ||
                        (
                            order.status === "PROCESSING" &&
                            !hasCarriedOverItems
                        )
                    ) {
                        fail(
                            "ამ შეკვეთაზე დაბრუნების მოლოდინი საჭირო არ არის.",
                            409,
                        );
                    }
                    if (body.items !== undefined && !Array.isArray(body.items)) {
                        fail("დასაბრუნებელი პროდუქტები არასწორადაა მითითებული.", 422);
                    }
                    if (Array.isArray(body.items) && body.items.length > 0) {
                        await requestOrderReturn(
                            tx, businessId, orderId,
                            body.items as ReturnSelection[], true,
                        );
                    } else {
                        if (!pendingReturns) {
                            fail("აირჩიე დასაბრუნებელი ნივთები ან შექმენი დაბრუნების მოთხოვნა.", 422);
                        }
                        await tx.order.update({
                            where: { id: orderId },
                            data: {
                                deleteRequestedAt: new Date(),
                                invoiceVersion: { increment: 1 },
                            },
                        });
                    }
                    changed = true;
                } else {
                    if (pendingReturns > 0) {
                        fail("შეკვეთა დაბრუნების მოლოდინშია. ჯერ დაადასტურე ნივთების მიღება.", 409);
                    }

                    let restored = false;
                    if (order.status === "PROCESSING" && !order.stockReturnedAt) {
                        const hasCarriedOverItems = order.items.some(
                            item => item.isCarriedOver && !item.stockRestoredAt,
                        );

                        if (hasCarriedOverItems) {
                            if (body.mode === "NO_RETURN") {
                                if (body.confirmNoReturn !== true) {
                                    fail(
                                        "დაადასტურე, რომ კლიენტთან დარჩენილი ნივთები აღარ დაბრუნდება და მარაგს არ დაემატება.",
                                        422,
                                    );
                                }
                            } else if (body.mode !== "RECEIVED") {
                                fail(
                                    "შეკვეთაში კლიენტთან დარჩენილი ნივთებია. ჯერ დაადასტურე მათი დაბრუნება ან მიუთითე, რომ დაბრუნება აღარ იგეგმება.",
                                    422,
                                );
                            }
                        }

                        restored = await restoreOrderStock(
                            tx,
                            order,
                            "შეკვეთის წაშლა და პროდუქტის დაბრუნება",
                        );

                        if (
                            hasCarriedOverItems &&
                            body.mode === "RECEIVED" &&
                            !restored
                        ) {
                            fail(
                                "ჯერ დაბრუნების ფანჯარაში დაადასტურე კლიენტთან დარჩენილი ნივთების ფიზიკური მიღება.",
                                422,
                            );
                        }
                    } else if (order.status !== "COMPLETED" && !order.stockReturnedAt) {
                        if (body.mode === "NO_RETURN") {
                            if (body.confirmNoReturn !== true) {
                                fail("დაადასტურე, რომ დარჩენილი ნივთები აღარ დაბრუნდება და მარაგს არ დაემატება.", 422);
                            }
                        } else if (body.mode === "RECEIVED") {
                            const received = await tx.orderReturn.findMany({
                                where: { orderId, status: "RECEIVED" },
                                select: { items: { select: { orderItemId: true, quantity: true } } },
                            });
                            const fullyReceived = order.items.every(item =>
                                received.reduce((sum, entry) => sum + entry.items.reduce(
                                    (count, returned) => count + (returned.orderItemId === item.id ? returned.quantity : 0), 0,
                                ), 0) === item.quantity,
                            );
                            if (!fullyReceived) {
                                fail("ჯერ დაბრუნების ფანჯარაში დაადასტურე ყველა დასაბრუნებელი ნივთის მიღება. თუ დარჩენილი ნივთები აღარ დაბრუნდება, აირჩიე შესაბამისი ვარიანტი.", 422);
                            }
                        } else {
                            fail("მიუთითე: ნივთები დაბრუნდა, დაბრუნებას ველოდებით თუ დაბრუნება აღარ იგეგმება.", 422);
                        }
                    }

                    await tx.order.update({
                        where: { id: orderId },
                        data: {
                            deletedAt: new Date(),
                            publicAccessToken: null,
                            deleteRequestedAt: null,
                            invoiceVersion: { increment: 1 },
                            ...(restored ? { stockReturnedAt: new Date() } : {}),
                        },
                    });
                    changed = true;
                }

            } else if (kind === "cancel-deletion") {
                if (body.confirmCancelDeletion !== true) {
                    fail(
                        "დაადასტურე წაშლის მოთხოვნის გაუქმება.",
                        422,
                    );
                }

                if (order.deleteRequestedAt) {
                    await tx.order.update({
                        where: {
                            id: orderId,
                        },
                        data: {
                            deleteRequestedAt: null,
                            invoiceVersion: {
                                increment: 1,
                            },
                        },
                    });

                    changed = true;
                }
            } else if (kind === "refund") {
                refundSummary = await confirmOrderRefund(
                    tx,
                    order,
                    body,
                );

                changed = true;
            } else if (kind === "exchange") {
                exchangeSummary = await exchangeOrderProducts(
                    tx,
                    businessId,
                    order,
                    requestId,
                    body.items,
                );

                changed = true;
            } else if (kind === "link") {
                if (body.action !== "create" && body.action !== "revoke" && body.action !== "rotate") fail("ბმულის მოქმედება არასწორია.");
                // create არსებული ბმულის შემთხვევაში არ ცვლის კლიენტისთვის უკვე გაგზავნილ URL-ს.
                if ((body.action === "create" && !order.publicAccessToken) || body.action === "rotate" || (body.action === "revoke" && order.publicAccessToken)) {
                    await tx.order.update({ where: { id: orderId }, data: { publicAccessToken: body.action === "revoke" ? null : createPublicOrderToken(), invoiceVersion: { increment: 1 } } });
                    changed = true;
                }
            }
            const version = changed
                ? (
                    await tx.order.findUniqueOrThrow({
                        where: { id: orderId },
                        select: { invoiceVersion: true },
                    })
                ).invoiceVersion
                : order.invoiceVersion;

            let readyToDelete = false;

            if (kind === "return" && body.action === "receive") {
                const latestOrder = await tx.order.findUniqueOrThrow({
                    where: {
                        id: orderId,
                    },
                    select: {
                        deleteRequestedAt: true,
                        fulfillmentCycle: true,
                    },
                });

                if (latestOrder.deleteRequestedAt) {
                    const pendingReturns = await tx.orderReturn.count({
                        where: {
                            orderId,
                            fulfillmentCycle: latestOrder.fulfillmentCycle,
                            status: "PENDING",
                        },
                    });

                    readyToDelete = pendingReturns === 0;
                }
            }

            const result = {
                id: order.id,
                number: order.number,
                version,
                action: kind,
                readyToDelete,
                ...(exchangeSummary
                    ? { exchange: exchangeSummary }
                    : {}),
                ...(refundSummary
                    ? { refund: refundSummary }
                    : {}),
            };
            await tx.orderMutation.create({ data: { orderId, requestId, fingerprint: hash, result } });
            return result;
        }, { maxWait: 10000, timeout: 60000 });
    } finally { await prisma.$disconnect(); }
}
