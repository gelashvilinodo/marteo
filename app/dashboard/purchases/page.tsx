import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import NewPurchasePanel from "@/components/dashboard/purchases/NewPurchasePanel";

export default async function PurchasesPage() {
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

  const purchases = await prisma.purchase.findMany({
    where: {
      businessId: membership.businessId,
    },
    orderBy: {
      purchaseDate: "desc",
    },
    include: {
      items: true,
    },
  });

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: {
      businessId: membership.businessId,
      isActive: true,
    },
    orderBy: {
      product: { name: "asc" },
    },
    include: {
      product: true,
      purchaseItems: {
        orderBy: [
          { purchase: { purchaseDate: "desc" } },
          { createdAt: "desc" },
        ],
        take: 1,
      },
    },
  });

  const inventoryOptions = inventoryItems.map((item) => ({
    id: item.id,
    productId: item.productId,
    sku: item.sku,
    name: item.product.name,
    category: item.product.category ?? "",
    brand: item.product.brand ?? "",
    description: item.product.description ?? "",
    color: item.color ?? "",
    size: item.size ?? "",
    imageUrl: item.imageUrl ?? "",
    currentStock: item.currentStock,
    unitPurchasePrice:
      item.purchaseItems[0]?.unitPurchasePrice.toString() ?? "",
    pricingMethod: item.pricingMethod ?? "MANUAL",
    pricingValue:
      item.pricingMethod && item.pricingMethod !== "MANUAL"
        ? item.pricingValue?.toString() ?? ""
        : item.salePrice?.toString() ?? "",
  }));

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              შესყიდვები
            </h1>
          </div>

          <NewPurchasePanel inventoryOptions={inventoryOptions} />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
          {purchases.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <h2 className="text-base font-semibold text-text-primary">
                შესყიდვები ჯერ არ გაქვს
              </h2>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <p className="font-medium text-text-primary">
                      #{String(purchase.number).padStart(3, "0")}
                      {purchase.name ? ` — ${purchase.name}` : ""}
                    </p>

                    <p className="mt-1 text-sm text-text-secondary">
                      {purchase.items.length} პროდუქტი
                    </p>
                  </div>

                  <p className="text-sm text-text-secondary">
                    {purchase.purchaseDate.toLocaleDateString("ka-GE")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}