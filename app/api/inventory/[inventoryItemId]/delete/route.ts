import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPrismaClient } from "@/lib/prisma";
import { InventoryEditError } from "@/lib/inventory/validate-inventory-edit";
import { getInventoryDeleteImpact } from "@/lib/inventory/get-inventory-delete-impact";
import { deleteInventoryItem } from "@/lib/inventory/delete-inventory-item";
import { readOrderBody } from "@/lib/orders/order-http";
import { OrderValidationError } from "@/lib/orders/order-validation-error";

type RouteContext = {
    params: Promise<{ inventoryItemId: string }>;
};

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

function errorResponse(cause: unknown) {
    if (
        cause instanceof InventoryEditError ||
        cause instanceof OrderValidationError
    ) {
        return json(
            { success: false, message: cause.message },
            cause.status,
        );
    }

    console.error(
        "Inventory deletion failed",
        cause instanceof Error ? cause.name : "UnknownError",
    );

    return json(
        {
            success: false,
            message:
                "მოქმედების შედეგი ვერ დადასტურდა. შეინარჩუნე წაშლის ფანჯარა და გადაამოწმე შედეგი იმავე მოთხოვნით.",
        },
        500,
    );
}

async function getAccess(routeContext: RouteContext) {
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

    return {
        userId: context.user.id,
        businessId: context.membership.businessId,
        inventoryItemId,
    };
}

// მხოლოდ წასაშლელი მარაგის შეჯამების მიღება.
export async function GET(
    _request: Request,
    routeContext: RouteContext,
) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;

    try {
        const access = await getAccess(routeContext);
        prisma = createPrismaClient();

        const data = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id FROM "Business"
                    WHERE id = ${access.businessId}
                    FOR SHARE
                `;

                const membership =
                    await tx.businessMembership.findFirst({
                        where: {
                            userId: access.userId,
                            businessId: access.businessId,
                        },
                        select: { id: true },
                    });

                if (!membership) {
                    throw new InventoryEditError(
                        "ამ ბიზნესზე წვდომა აღარ გაქვს.",
                        403,
                    );
                }

                return getInventoryDeleteImpact(
                    tx,
                    access.businessId,
                    access.inventoryItemId,
                );
            },
            {
                maxWait: 10000,
                timeout: 15000,
            },
        );

        return json({ success: true, data });
    } catch (cause: unknown) {
        return errorResponse(cause);
    } finally {
        await prisma?.$disconnect();
    }
}

// დადასტურებული წაშლა.
// readOrderBody ამოწმებს Origin-სა და JSON ფორმატსაც.
export async function POST(
    request: Request,
    routeContext: RouteContext,
) {
    try {
        const body = await readOrderBody(request);
        const access = await getAccess(routeContext);

        const data = await deleteInventoryItem(
            access.userId,
            access.businessId,
            access.inventoryItemId,
            body,
        );

        return json({ success: true, data });
    } catch (cause: unknown) {
        return errorResponse(cause);
    }
}