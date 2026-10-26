import "server-only";
import { createPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPurchaseFormOptions } from "./get-purchase-form-options";

export type PurchasesSearchParams = Record<string, string | string[] | undefined>;
function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}


export async function getPurchasesSnapshot(businessId: string, params: PurchasesSearchParams) {
  const view = "active" as const;
  const isArchive = false;

  const query = singleValue(params.q).slice(0, 150);
  const rawFrom = singleValue(params.from);
  const rawTo = singleValue(params.to);

  const from = validDate(rawFrom) ? rawFrom : "";
  const to = validDate(rawTo) ? rawTo : "";

  const filterError =
    (rawFrom && !from) || (rawTo && !to)
      ? "მიუთითე სწორი თარიღი."
      : from && to && from > to
        ? "საწყისი თარიღი საბოლოო თარიღზე გვიან არ უნდა იყოს."
        : "";

  const rawPage = singleValue(params.page);
  const parsedPage = Number(rawPage);

  const requestedPage =
    /^\d+$/.test(rawPage) &&
      Number.isSafeInteger(parsedPage) &&
      parsedPage > 0
      ? parsedPage
      : 1;

  const pageSize = 10;
  const hasFilters = Boolean(query || rawFrom || rawTo);


  const prisma = createPrismaClient();
  try {
    return await prisma.$transaction(async tx => {
      const where: Prisma.PurchaseWhereInput = {
        businessId,
      };

      if (query) {
        const numberText = query.replace(/^#/, "");
        const purchaseNumber = Number(numberText);

        const conditions: Prisma.PurchaseWhereInput[] = [
          {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            items: {
              some: {
                inventoryItem: {
                  product: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
        ];

        if (
          /^\d+$/.test(numberText) &&
          Number.isSafeInteger(purchaseNumber) &&
          purchaseNumber > 0 &&
          purchaseNumber <= 2147483647
        ) {
          conditions.push({ number: purchaseNumber });
        }

        where.OR = conditions;
      }

      if (from || to) {
        where.purchaseDate = {
          ...(from
            ? { gte: new Date(`${from}T00:00:00+04:00`) }
            : {}),
          ...(to
            ? {
              lt: new Date(
                new Date(`${to}T00:00:00+04:00`).getTime() +
                24 * 60 * 60 * 1000,
              ),
            }
            : {}),
        };
      }

      if (filterError) {
        where.id = { in: [] };
      }

      const totalPurchases = await tx.purchase.count({ where });

      const totalPages = Math.max(
        1,
        Math.ceil(totalPurchases / pageSize),
      );

      const currentPage = Math.min(requestedPage, totalPages);

      const visiblePages =
        totalPages <= 7
          ? Array.from({ length: totalPages }, (_, index) => index + 1)
          : [...new Set([
            1,
            totalPages,
            ...Array.from(
              { length: 5 },
              (_, index) =>
                Math.max(
                  2,
                  Math.min(currentPage - 2, totalPages - 5),
                ) + index,
            ),
          ])].sort((first, second) => first - second);

      const paginationItems: Array<number | string> = [];

      for (const [index, page] of visiblePages.entries()) {
        const previous = visiblePages[index - 1];

        if (index > 0 && page - previous > 1) {
          paginationItems.push(`gap-${previous}-${page}`);
        }

        paginationItems.push(page);
      }

      const purchases = await tx.purchase.findMany({
        where,
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        orderBy: [
          { purchaseDate: "desc" },
          { number: "desc" },
        ],
        include: {
          items: {
            include: {
              _count: {
                select: {
                  orderAllocations: true,
                  inventoryMovements: {
                    where: {
                      type: { not: "PURCHASE_IN" },
                    },
                  },
                },
              },
              inventoryItem: {
                select: {
                  id: true,
                  imageUrl: true,
                  color: true,
                  size: true,
                  product: {
                    select: {
                      name: true,
                      category: true,
                      brand: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const { inventoryOptions, attributeOptions, countryOptions } =
        await getPurchaseFormOptions(tx, businessId);

      return {
        view: view as "active" | "archive", isArchive, query, from, to, filterError, hasFilters,
        totalPurchases, currentPage, requestedPage, totalPages, pageSize, paginationItems, inventoryOptions, attributeOptions, countryOptions,
        purchases: purchases.map(purchase => {
          const productsCost = purchase.items.reduce((sum, item) => sum.plus(item.unitPurchasePrice.mul(item.quantity)), new Prisma.Decimal(0));
          return {
            id: purchase.id, number: purchase.number, name: purchase.name, country: purchase.country, note: purchase.note,
            receiptStatus: purchase.receiptStatus, archivedAt: purchase.archivedAt?.toISOString() ?? null,
            purchaseDate: purchase.purchaseDate.toISOString(),
            dateLabel: new Intl.DateTimeFormat("ka-GE", {
              day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tbilisi",
            }).format(purchase.purchaseDate),
            shippingCost: purchase.shippingCost.toFixed(2), customsCost: purchase.customsCost.toFixed(2), otherCost: purchase.otherCost.toFixed(2),
            productsCost: productsCost.toFixed(2),
            totalCost: productsCost.plus(purchase.shippingCost).plus(purchase.customsCost).plus(purchase.otherCost).toFixed(2),
            items: purchase.items.map(item => ({
              id: item.id, quantity: item.quantity, defectiveQuantity: item.defectiveQuantity,
              remainingQuantity: item.remainingQuantity, remainingDefectiveQuantity: item.remainingDefectiveQuantity,
              defectNote: item.defectNote, unitPurchasePrice: item.unitPurchasePrice.toString(), finalUnitCost: item.finalUnitCost.toString(),
              _count: item._count, inventoryItem: item.inventoryItem,
            })),
          };
        }),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10000, timeout: 15000 });
  } finally { await prisma.$disconnect(); }
}
export type PurchasesSnapshot = Awaited<ReturnType<typeof getPurchasesSnapshot>>;
