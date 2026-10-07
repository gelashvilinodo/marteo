import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { getInventoryPage, type InventorySearchParams } from "@/lib/inventory/get-inventory-page";

import InventoryView from "@/components/dashboard/inventory/InventoryView";

import type { InventoryMovementEntry } from "@/components/dashboard/inventory/LatestInventoryMovements";


export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventorySearchParams> }) {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const prisma = createPrismaClient();

    const membership = await prisma.businessMembership.findFirst({
        where: {
            userId: user.id,
        },
        orderBy: {
            createdAt: "asc",
        },
        select: {
            businessId: true,
        },
    });

    if (!membership) {
        redirect("/business/onboarding");
    }

    const businessId = membership.businessId;

    const data = await getInventoryPage(prisma, businessId, await searchParams);

    const latestMovements = await prisma.inventoryMovement.findMany({
        where: {
            inventoryItem: {
                businessId,
                product: {
                    businessId,
                },
            },
        },
        orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
        ],
        take: 5,
        select: {
            id: true,
            type: true,
            condition: true,
            quantity: true,
            createdAt: true,
            inventoryItem: {
                select: {
                    color: true,
                    size: true,
                    product: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
    });

    const movements: InventoryMovementEntry[] = latestMovements.map(
        (movement) => ({
            id: movement.id,
            type: movement.type,
            condition: movement.condition,
            quantity: movement.quantity,
            createdAt: movement.createdAt.toISOString(),
            name: movement.inventoryItem.product.name,
            color: movement.inventoryItem.color,
            size: movement.inventoryItem.size,
        }),
    );

    return (
        <InventoryView
            data={data}
            movements={movements}
        />
    );
}