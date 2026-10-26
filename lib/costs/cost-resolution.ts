import { numericQuantities } from "@/lib/orders/quantity";
import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { CostInputError, type CostScope, type CostPreview, type CostRow, readCostInput } from "./cost-input";
type Client = Prisma.TransactionClient;
const label = (item: {
    name: string;
    color: string | null;
    size: string | null;
}) => [item.name, item.color, item.size].filter(Boolean).join(" · ");
export async function getCostPreview(tx: Client, businessId: string, scope: CostScope): Promise<CostPreview> {
    const inventory = scope.inventoryItemId ? await tx.inventoryItem.findFirst({
        where: {
            id: scope.inventoryItemId,
            businessId
        },
        include: {
            product: true
        }
    }) : null;
    if (scope.inventoryItemId && !inventory)
        throw new CostInputError("პროდუქტი ვერ მოიძებნა.", 404);
    if (scope.orderId && !(await tx.order.findFirst({
        where: {
            id: scope.orderId,
            businessId
        },
        select: {
            id: true
        }
    }).then(numericQuantities)))
        throw new CostInputError("შეკვეთა ვერ მოიძებნა.", 404);
    const stock = scope.orderId ? [] : await tx.inventoryItem.findMany({
        where: {
            businessId,
            ...(scope.inventoryItemId ? {
                id: scope.inventoryItemId
            } : {}),
            stockLots: {
                some: {
                    purchaseItemId: null,
                    sourcePurchaseItemId: null,
                    unitCost: null,
                    remainingCost: null,
                    remainingQuantity: {
                        gt: 0
                    }
                }
            }
        },
        include: {
            product: true,
            stockLots: {
                where: {
                    purchaseItemId: null,
                    sourcePurchaseItemId: null,
                    unitCost: null,
                    remainingCost: null,
                    remainingQuantity: {
                        gt: 0
                    }
                },
                orderBy: {
                    id: "asc"
                }
            }
        },
        orderBy: {
            id: "asc"
        },
        take: 51
    });
    const historical = await tx.orderItem.findMany({
        where: {
            source: "MANUAL",
            isCarriedOver: false,
            totalCost: null,
            order: {
                businessId,
                ...(scope.orderId ? {
                    id: scope.orderId
                } : {})
            },
            ...(inventory ? {
                name: inventory.product.name,
                color: inventory.color,
                size: inventory.size
            } : {})
        },
        include: {
            order: {
                select: {
                    id: true,
                    number: true,
                    createdAt: true,
                    updatedAt: true,
                    status: true,
                    deletedAt: true
                }
            }
        },
        orderBy: [{
                createdAt: "asc"
            }, {
                id: "asc"
            }],
        take: 51
    }).then(numericQuantities);
    const rows: CostRow[] = [...stock.slice(0, 50).map(item => ({
            key: `stock:${item.id}`,
            kind: "stock" as const,
            name: label({
                ...item,
                name: item.product.name
            }),
            quantity: item.stockLots.reduce((sum, l) => sum + l.remainingQuantity, 0),
            orderNumber: null,
            date: null,
            inventoryItemId: item.id,
            orderId: null
        })), ...historical.slice(0, 50).map(item => ({
            key: `order:${item.id}`,
            kind: "order" as const,
            name: label(item),
            quantity: item.quantity,
            orderNumber: item.order.number,
            date: item.order.createdAt.toISOString(),
            inventoryItemId: null,
            orderId: item.order.id
        }))];
    const token = createHash("sha256").update(JSON.stringify({
        businessId,
        scope,
        stock,
        historical
    })).digest("hex");
    return {
        token,
        rows,
        hasMore: stock.length > 50 || historical.length > 50
    };
}
// Caller holds the Business row lock. Only previously unknown costs are filled.
export async function saveMissingCosts(tx: Client, businessId: string, raw: unknown) {
    const input = readCostInput(raw);
    const preview = await getCostPreview(tx, businessId, input.scope);
    if (preview.token !== input.token)
        throw new CostInputError("მონაცემები შეიცვალა. განაახლე სია და გადაამოწმე თანხები.", 409);
    const allowed = new Map(preview.rows.map(row => [row.key, row]));
    const stock: Array<{id:string; unitCost:string}> = [];
    const historical: Array<{id:string; orderId:string; unitCost:string}> = [];
    for (const entry of input.entries) {
        const row = allowed.get(entry.key);
        if (!row) throw new CostInputError("არჩეული ჩანაწერი აღარ საჭიროებს შევსებას ან სხვა ბიზნესს ეკუთვნის.",409);
        const unitCost = new Prisma.Decimal(entry.unitCost);
        if (unitCost.mul(row.quantity).gt("9999999999999999.99")) throw new CostInputError("ჯამური თვითღირებულება დასაშვებ ზღვარს აღემატება.");
        if (row.kind === "stock") stock.push({id:row.inventoryItemId!,unitCost:unitCost.toFixed(2)});
        else historical.push({id:entry.key.slice(6),orderId:row.orderId!,unitCost:unitCost.toFixed(2)});
    }
    // Batch updates keep a large import from making one round trip per line.
    if (stock.length) {
        const values = Prisma.join(stock.map(row=>Prisma.sql`(${row.id}::text, ${row.unitCost}::numeric)`));
        await tx.$executeRaw(Prisma.sql`
            WITH input(id, unit_cost) AS (VALUES ${values})
            UPDATE "InventoryStockLot" lot SET
                "unitCost"=input.unit_cost,
                "remainingCost"=input.unit_cost*lot."remainingQuantity",
                "updatedAt"=CURRENT_TIMESTAMP
            FROM input, "InventoryItem" inventory
            WHERE inventory.id=input.id AND inventory."businessId"=${businessId}
                AND lot."inventoryItemId"=inventory.id
                AND lot."purchaseItemId" IS NULL AND lot."sourcePurchaseItemId" IS NULL
                AND lot."unitCost" IS NULL AND lot."remainingCost" IS NULL
                AND lot."remainingQuantity">0
        `);
    }
    if (historical.length) {
        const values=Prisma.join(historical.map(row=>Prisma.sql`(${row.id}::text, ${row.orderId}::text, ${row.unitCost}::numeric)`));
        await tx.$executeRaw(Prisma.sql`
            WITH input(id, order_id, unit_cost) AS (VALUES ${values})
            UPDATE "OrderItem" item SET
                "unitCost"=input.unit_cost,
                "totalCost"=input.unit_cost*item.quantity,
                "updatedAt"=CURRENT_TIMESTAMP
            FROM input, "Order" scoped
            WHERE scoped.id=input.order_id AND scoped."businessId"=${businessId}
                AND item."orderId"=scoped.id AND item.source='MANUAL'
                AND (item.id=input.id OR item."financialSourceItemId"=input.id)
                AND item."totalCost" IS NULL
        `);
        await tx.$executeRaw(Prisma.sql`
            WITH input(id, order_id, unit_cost) AS (VALUES ${values})
            UPDATE "OrderFinancialEntryItem" line SET
                "costDelta"=input.unit_cost*line."quantityDelta",
                "costComplete"=TRUE
            FROM input, "OrderFinancialEntry" entry
            WHERE entry.id=line."entryId" AND entry."businessId"=${businessId}
                AND entry."orderId"=input.order_id
                AND line."sourceOrderItemId"=input.id AND line."costComplete"=FALSE
        `);
    }
    const orderIds=[...new Set(historical.map(row=>row.orderId))];
    for (const orderId of orderIds) {
        await refreshOrderCosts(tx,businessId,orderId);
        await tx.orderMutation.create({data:{orderId,requestId:`cost:${input.token}`,fingerprint:input.token,result:{kind:"COST_RESOLUTION",items:historical.filter(row=>row.orderId===orderId).map(row=>({id:row.id,unitCost:row.unitCost}))}}});
    }
    return { stockProducts:stock.length, orderLines:historical.length };
}

async function refreshOrderCosts(tx: Client, businessId: string, orderId: string) {
    const order = await tx.order.findFirstOrThrow({
        where: {
            id: orderId,
            businessId
        },
        include: {
            items: true,
            returns: {
                where: {
                    status: "RECEIVED"
                },
                include: {
                    items: true
                }
            },
            financialEntries: {
                include: {
                    items: true
                }
            }
        }
    }).then(numericQuantities);
    // Imported orders without costs have no sale snapshot at all. Restore
    // original sales and received returns at their original dates, once only.
    if (order.analyticsPendingCost && !order.financialEntries.some(e => e.kind === "SALE" && e.fulfillmentCycle === 0) && ["COMPLETED", "RETURNED"].includes(order.status)) {
        const soldItems = order.items.filter(i => !i.isCarriedOver);
        const originalItems = soldItems.filter(i => i.fulfillmentCycle === 0);
        const makeLines = (items: typeof soldItems) => items.map(item => ({
            sourceOrderItemId: item.financialSourceItemId ?? item.id,
            name: item.name,
            quantityDelta: item.quantity,
            revenueDelta: item.unitPrice.mul(item.quantity),
            costDelta: item.totalCost ?? new Prisma.Decimal(0),
            costComplete: item.totalCost !== null
        }));
        if (originalItems.length) {
            const lines = makeLines(originalItems);
            await tx.orderFinancialEntry.create({
                data: {
                    businessId,
                    orderId,
                    orderNumber: order.number,
                    fulfillmentCycle: 0,
                    eventKey: `cost-resolution:${orderId}:initial-sale`,
                    kind: "SALE",
                    occurredAt: order.createdAt,
                    productRevenueDelta: lines.reduce((s, l) => s.plus(l.revenueDelta), new Prisma.Decimal(0)),
                    deliveryRevenueDelta: order.courierFee,
                    costOfGoodsDelta: lines.reduce((s, l) => s.plus(l.costDelta), new Prisma.Decimal(0)),
                    costComplete: lines.every(l => l.costComplete),
                    items: {
                        create: lines
                    }
                }
            });
        }
        const firstLaterSale = order.financialEntries.filter(e => e.kind === "SALE").sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))[0];
        // Returns before the first recorded completion were not recorded while
        // the imported order was missing its initial sale snapshot.
        const earlyReturns = order.returns.filter(r => !firstLaterSale || r.receivedAt && r.receivedAt <= firstLaterSale.occurredAt);
        for (const returned of earlyReturns) {
            if (!returned.receivedAt)
                continue;
            const lines = returned.items.flatMap(ri => {
                const returnedItem = order.items.find(i => i.id === ri.orderItemId);
                const item = originalItems.find(i => i.id === (returnedItem?.financialSourceItemId ?? ri.orderItemId));
                return item ? [{
                        sourceOrderItemId: item.id,
                        name: item.name,
                        quantityDelta: -ri.quantity,
                        revenueDelta: item.unitPrice.mul(-ri.quantity),
                        costDelta: item.totalCost === null ? new Prisma.Decimal(0) : item.unitCost.mul(-ri.quantity),
                        costComplete: item.totalCost !== null
                    }] : [];
            });
            if (lines.length)
                await tx.orderFinancialEntry.create({
                    data: {
                        businessId,
                        orderId,
                        orderNumber: order.number,
                        fulfillmentCycle: returned.fulfillmentCycle,
                        eventKey: `cost-resolution:${orderId}:return:${returned.id}`,
                        kind: "RETURN",
                        occurredAt: returned.receivedAt,
                        productRevenueDelta: lines.reduce((s, l) => s.plus(l.revenueDelta), new Prisma.Decimal(0)),
                        costOfGoodsDelta: lines.reduce((s, l) => s.plus(l.costDelta), new Prisma.Decimal(0)),
                        costComplete: lines.every(l => l.costComplete),
                        items: {
                            create: lines
                        }
                    }
                });
        }
        if (firstLaterSale) {
            // That first snapshot previously treated carried-over products as
            // new revenue. Rebase only their deltas after restoring the initial
            // sale; replacement products retain their own recorded amounts.
            for (const original of originalItems) {
                const returnedQuantity = earlyReturns.reduce((sum, r) => sum + r.items.reduce((n, ri) => {
                    const item = order.items.find(i => i.id === ri.orderItemId);
                    return n + ((item?.financialSourceItemId ?? ri.orderItemId) === original.id ? ri.quantity : 0);
                }, 0), 0);
                const carriedQuantity = original.quantity - returnedQuantity;
                if (carriedQuantity < 0)
                    throw new CostInputError("დაბრუნებული რაოდენობა გაყიდულ რაოდენობას აღემატება.", 409);
                const line = firstLaterSale.items.find(i => i.sourceOrderItemId === original.id);
                if (line && carriedQuantity > 0) {
                    const quantityDelta = line.quantityDelta - carriedQuantity;
                    await tx.orderFinancialEntryItem.update({
                        where: {
                            id: line.id
                        },
                        data: {
                            quantityDelta,
                            revenueDelta: line.revenueDelta.minus(original.unitPrice.mul(carriedQuantity)),
                            costDelta: original.totalCost === null ? line.costDelta : line.costDelta.minus(original.unitCost.mul(carriedQuantity))
                        }
                    });
                }
            }
            const lines = await tx.orderFinancialEntryItem.findMany({
                where: {
                    entryId: firstLaterSale.id
                }
            }).then(numericQuantities);
            await tx.orderFinancialEntry.update({
                where: {
                    id: firstLaterSale.id
                },
                data: {
                    productRevenueDelta: lines.reduce((sum, l) => sum.plus(l.revenueDelta), new Prisma.Decimal(0)),
                    deliveryRevenueDelta: firstLaterSale.deliveryRevenueDelta.minus(order.courierFee)
                }
            });
        }
    }
    const entries = await tx.orderFinancialEntry.findMany({
        where: {
            businessId,
            orderId
        },
        include: {
            items: true
        }
    });
    for (const entry of entries.filter(e => e.items.length > 0))
        await tx.orderFinancialEntry.update({
            where: {
                id: entry.id
            },
            data: {
                costOfGoodsDelta: entry.items.reduce((sum, line) => sum.plus(line.costDelta), new Prisma.Decimal(0)),
                costComplete: entry.items.every(line => line.costComplete)
            }
        });
    const unknown = await tx.orderItem.count({
        where: {
            orderId,
            source: "MANUAL",
            totalCost: null
        }
    });
    if (!unknown && order.analyticsPendingCost)
        await tx.order.update({
            where: {
                id: orderId
            },
            data: {
                analyticsPendingCost: false
            }
        });
}
