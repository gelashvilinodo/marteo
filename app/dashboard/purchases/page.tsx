import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import NewPurchasePanel from "@/components/dashboard/purchases/NewPurchasePanel";
import { Prisma } from "@/generated/prisma/client";
import PurchaseProducts from "@/components/dashboard/purchases/PurchaseProducts";
import PurchaseFiltersDisclosure from "@/components/dashboard/purchases/PurchaseFiltersDisclosure";
import ReceivePurchaseButton from "@/components/dashboard/purchases/ReceivePurchaseButton";
import PurchaseActionButton from "@/components/dashboard/purchases/PurchaseActionButton";
import PaginationLink from "@/components/dashboard/purchases/PaginationLink";

import Image from "next/image";
import { Icon } from "@iconify/react";
import Form from "next/form";
import Link from "next/link";

type PurchasesPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    from?: string | string[];
    to?: string | string[];
    page?: string | string[];
    view?: string | string[];
  }>;
};

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

function displayMoney(value: Prisma.Decimal) {
  const [integer, decimal] = value.toFixed(2).split(".");

  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${decimal} ₾`;
}

export default async function PurchasesPage({
  searchParams,
}: PurchasesPageProps) {
  const params = await searchParams;

  const view =
    singleValue(params.view) === "archive" ? "archive" : "active";

  const isArchive = view === "archive";

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

  function pageHref(
    page: number,
    selectedView: "active" | "archive" = view,
  ) {
    const search = new URLSearchParams();

    if (selectedView === "archive") search.set("view", "archive");
    if (query) search.set("q", query);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    if (page > 1) search.set("page", String(page));

    const suffix = search.toString();

    return `/dashboard/purchases${suffix ? `?${suffix}` : ""}`;
  }

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

  const where: Prisma.PurchaseWhereInput = {
    businessId: membership.businessId,
    archivedAt: isArchive ? { not: null } : null,
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

  const totalPurchases = await prisma.purchase.count({ where });

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

  const paginationClass =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-sm font-medium text-text-primary transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  if (!filterError && requestedPage > totalPages) {
    redirect(pageHref(totalPages));
  }

  const purchases = await prisma.purchase.findMany({
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

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: {
      businessId: membership.businessId,
      isActive: true,

      // არჩევანში მოხვდება მხოლოდ ის პროდუქტი,
      // რომელსაც მიღებული პარტია უკვე აქვს.
      purchaseItems: {
        some: {
          purchase: {
            businessId: membership.businessId,
            receiptStatus: "RECEIVED",
          },
        },
      },
    },
    orderBy: {
      product: { name: "asc" },
    },
    include: {
      product: true,
      purchaseItems: {
        // გზაში მყოფი პარტიის შესყიდვის ფასი
        // არსებული მარაგის ფასად არ გამოვიყენოთ.
        where: {
          purchase: {
            businessId: membership.businessId,
            receiptStatus: "RECEIVED",
          },
        },
        orderBy: [
          { purchase: { purchaseDate: "desc" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: 1,
      },
    },
  });

  const defectiveBalances = await prisma.purchaseItem.groupBy({
    by: ["inventoryItemId"],
    where: {
      purchase: {
        businessId: membership.businessId,
        receiptStatus: "RECEIVED",
      },
      inventoryItem: {
        businessId: membership.businessId,
        isActive: true,
      },
      remainingDefectiveQuantity: {
        gt: 0,
      },
    },
    _sum: {
      remainingDefectiveQuantity: true,
    },
  });

  const defectiveByInventoryId = new Map(
    defectiveBalances.map((balance) => [
      balance.inventoryItemId,
      balance._sum.remainingDefectiveQuantity ?? 0,
    ]),
  );

  const inventoryOptions = inventoryItems.map((item) => {
    const defectiveStock =
      defectiveByInventoryId.get(item.id) ?? 0;

    const goodStock = item.currentStock - defectiveStock;

    return {
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

      // არჩევის ფანჯარაში მხოლოდ დაუზიანებელი ნაშთი ჩანს.
      currentStock: goodStock,

      unitPurchasePrice:
        item.purchaseItems[0]?.unitPurchasePrice.toString() ?? "",

      pricingMethod: item.pricingMethod ?? "MANUAL",

      pricingValue:
        item.pricingMethod && item.pricingMethod !== "MANUAL"
          ? item.pricingValue?.toString() ?? ""
          : item.salePrice?.toString() ?? "",
    };
  });

  const attributes = await prisma.productAttribute.findMany({
    where: {
      businessId: membership.businessId,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      type: true,
      name: true,
    },
  });

  const productNames = await prisma.product.findMany({
    where: {
      businessId: membership.businessId,
    },
    select: {
      name: true,
    },
    distinct: ["name"],
    orderBy: {
      name: "asc",
    },
  });

  const attributeOptions = {
    name: productNames.map((product) => product.name),

    category: attributes
      .filter((item) => item.type === "CATEGORY")
      .map((item) => item.name),

    brand: attributes
      .filter((item) => item.type === "BRAND")
      .map((item) => item.name),

    color: attributes
      .filter((item) => item.type === "COLOR")
      .map((item) => item.name),

    size: attributes
      .filter((item) => item.type === "SIZE")
      .map((item) => item.name),
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            შესყიდვები
          </h1>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <nav
              aria-label="პარტიების სია"
              className="order-2 grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1 sm:order-1 sm:w-60 sm:shrink-0"
            >
              {([
                { value: "active", label: "აქტიური" },
                { value: "archive", label: "არქივი" },
              ] as const).map((tab) => (
                <Link
                  key={tab.value}
                  href={pageHref(1, tab.value)}
                  aria-current={view === tab.value ? "page" : undefined}
                  className={[
                    "flex h-9 min-w-0 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    view === tab.value
                      ? "bg-accent text-white"
                      : "text-text-secondary hover:bg-background hover:text-text-primary",
                  ].join(" ")}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>

            <div className="order-1 min-w-0 sm:order-2">
              <NewPurchasePanel
                inventoryOptions={inventoryOptions}
                attributeOptions={attributeOptions}
              />
            </div>
          </div>
        </div>

        <PurchaseFiltersDisclosure
          key={`${query}|${from}|${to}|${filterError}`}
          defaultOpen={hasFilters || Boolean(filterError)}
          hasFilters={hasFilters}
        >
          <Form
            action="/dashboard/purchases"
            className="border-t border-border p-3 sm:border-t-0 sm:p-4"
          >
            <input type="hidden" name="view" value={view} />
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
              <label className="block min-w-0 sm:col-span-2 xl:col-span-1">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  ძებნა
                </span>

                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  maxLength={150}
                  placeholder="პარტიის ნომერი, სახელი ან პროდუქტი"
                  className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] lg:text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  თარიღიდან
                </span>

                <input
                  type="date"
                  name="from"
                  defaultValue={from}
                  className="purchase-date-input block h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-border bg-background px-3 text-[16px] lg:text-sm text-text-primary outline-none focus:border-accent" />
              </label>

              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  თარიღამდე
                </span>

                <input
                  type="date"
                  name="to"
                  defaultValue={to}
                  className="purchase-date-input block h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-border bg-background px-3 text-[16px] lg:text-sm text-text-primary outline-none focus:border-accent" />
              </label>

              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-white transition hover:opacity-90 sm:col-span-2 xl:col-span-1"
              >
                ძებნა
              </button>
            </div>

            {hasFilters && (
              <div className="mt-3 flex justify-end">
                <Link
                  href={
                    isArchive
                      ? "/dashboard/purchases?view=archive"
                      : "/dashboard/purchases"
                  }
                  className="inline-flex min-h-9 items-center text-sm text-text-secondary underline underline-offset-4 hover:text-accent"
                >
                  გასუფთავება
                </Link>
              </div>
            )}

            {filterError && (
              <p role="alert" className="mt-3 text-sm text-red-500">
                {filterError}
              </p>
            )}
          </Form>
        </PurchaseFiltersDisclosure>

        <p className="mt-4 text-sm text-text-secondary">
          {totalPurchases} პარტია
        </p>

        <div className="mt-6 space-y-4">
          {purchases.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-surface px-6 text-center">
              <h2 className="text-base font-medium text-text-secondary">
                {filterError
                  ? "შეასწორე თარიღის ფილტრი"
                  : hasFilters
                    ? "პარტიები ვერ მოიძებნა"
                    : isArchive
                      ? "არქივი ცარიელია"
                      : "შესყიდვები ჯერ არ გაქვს"}
              </h2>
            </div>
          ) : (
            purchases.map((purchase) => {
              const variants = Array.from(
                new Map(
                  purchase.items.map((item) => [
                    item.inventoryItem.id,
                    item.inventoryItem,
                  ]),
                ).values(),
              );

              const quantity = purchase.items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              );

              const productsCost = purchase.items.reduce(
                (sum, item) =>
                  sum.plus(
                    item.unitPurchasePrice.mul(item.quantity),
                  ),
                new Prisma.Decimal(0),
              );

              const totalCost = productsCost
                .plus(purchase.shippingCost)
                .plus(purchase.customsCost)
                .plus(purchase.otherCost);

              const number = String(purchase.number).padStart(
                3,
                "0",
              );

              const date = new Intl.DateTimeFormat("ka-GE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: "Asia/Tbilisi",
              }).format(purchase.purchaseDate);

              const previewVariants = variants.slice(0, 3);
              const remainingVariants =
                variants.length - previewVariants.length;

              return (
                <article
                  key={purchase.id}
                  className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex shrink-0 items-center rounded-lg bg-accent/10 px-2.5 py-1 text-sm font-semibold text-accent">
                          #{number}
                        </span>

                        <h2 className="min-w-0 break-words text-base font-semibold text-text-primary">
                          {purchase.name || `პარტია #${number}`}
                        </h2>
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium",
                            purchase.receiptStatus === "RECEIVED"
                              ? "bg-success/10 text-success"
                              : "bg-amber-500/10 text-amber-600",
                          ].join(" ")}
                        >
                          <Icon
                            icon={
                              purchase.receiptStatus === "RECEIVED"
                                ? "solar:check-circle-linear"
                                : "solar:delivery-linear"
                            }
                            className="h-4 w-4"
                            aria-hidden="true"
                          />

                          {purchase.receiptStatus === "RECEIVED"
                            ? "ჩამოსული"
                            : "გზაში"}
                        </span>
                      </div>

                      <time
                        dateTime={purchase.purchaseDate.toISOString()}
                        className="mt-2 block text-xs text-text-secondary sm:text-sm"
                      >
                        {date}
                      </time>

                      {purchase.receiptStatus === "IN_TRANSIT" && (
                        <ReceivePurchaseButton
                          purchaseId={purchase.id}
                          purchaseNumber={purchase.number}
                          items={purchase.items.map((item) => ({
                            id: item.id,
                            name: item.inventoryItem.product.name,
                            quantity: item.quantity,
                            attributes: [
                              item.inventoryItem.product.brand,
                              item.inventoryItem.color,
                              item.inventoryItem.size,
                            ]
                              .filter(Boolean)
                              .join(" · "),
                          }))}
                        />
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {purchase.archivedAt === null &&
                        purchase.items.every(
                          (item) =>
                            item._count.orderAllocations === 0 &&
                            item._count.inventoryMovements === 0 &&
                            (
                              purchase.receiptStatus === "IN_TRANSIT"
                                ? item.remainingQuantity === 0 &&
                                item.remainingDefectiveQuantity === 0
                                : item.remainingQuantity === item.quantity &&
                                item.remainingDefectiveQuantity ===
                                item.defectiveQuantity
                            ),
                        ) ? (
                        <NewPurchasePanel
                          editPurchaseId={purchase.id}
                          inventoryOptions={inventoryOptions}
                          attributeOptions={attributeOptions}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled
                          aria-label={`პარტია #${number} — რედაქტირება მიუწვდომელია`}
                          title="პარტია არქივშია ან მის მარაგზე ცვლილებაა დაფიქსირებული"
                          className="inline-flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-border text-text-secondary opacity-50"
                        >
                          <Icon
                            icon="solar:pen-new-square-linear"
                            className="h-5 w-5"
                            aria-hidden="true"
                          />
                        </button>
                      )}

                      <PurchaseActionButton
                        purchaseId={purchase.id}
                        purchaseNumber={purchase.number}
                        receiptStatus={purchase.receiptStatus}
                        archived={purchase.archivedAt !== null}
                      />
                    </div>
                  </div>

                  <PurchaseProducts
                    details={
                      <div className="space-y-3 border-t border-border pt-4">
                        <dl className="space-y-2 rounded-xl bg-background p-3 sm:p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <dt className="text-sm text-text-secondary">
                              პროდუქტების ღირებულება
                            </dt>
                            <dd className="text-sm font-medium tabular-nums text-text-primary">
                              {displayMoney(productsCost)}
                            </dd>
                          </div>

                          {[
                            {
                              label: "ტრანსპორტირება",
                              value: purchase.shippingCost,
                            },
                            {
                              label: "განბაჟება",
                              value: purchase.customsCost,
                            },
                            {
                              label: "სხვა ხარჯი",
                              value: purchase.otherCost,
                            },
                          ]
                            .filter((expense) => !expense.value.isZero())
                            .map((expense) => (
                              <div
                                key={expense.label}
                                className="flex flex-wrap items-baseline justify-between gap-2"
                              >
                                <dt className="text-sm text-text-secondary">
                                  {expense.label}
                                </dt>
                                <dd className="text-sm font-medium tabular-nums text-text-primary">
                                  {displayMoney(expense.value)}
                                </dd>
                              </div>
                            ))}
                        </dl>

                        {purchase.note?.trim() && (
                          <div className="rounded-xl border border-border p-3 sm:p-4">
                            <h3 className="text-xs font-medium text-text-secondary">
                              შენიშვნა
                            </h3>

                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                              {purchase.note}
                            </p>
                          </div>
                        )}
                      </div>
                    }
                    items={purchase.items.map((item) => ({
                      id: item.id,
                      name: item.inventoryItem.product.name,
                      imageUrl: item.inventoryItem.imageUrl,
                      category: item.inventoryItem.product.category,
                      brand: item.inventoryItem.product.brand,
                      color: item.inventoryItem.color,
                      size: item.inventoryItem.size,
                      quantity: item.quantity,
                      defectiveQuantity: item.defectiveQuantity,
                      defectNote: item.defectNote,
                      unitPurchasePrice: item.unitPurchasePrice.toString(),
                      finalUnitCost: item.finalUnitCost.toString(),
                    }))}
                  >
                    {previewVariants.map((variant) => (
                      <div
                        key={variant.id}
                        title={variant.product.name}
                        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background sm:h-14 sm:w-14"
                      >
                        {variant.imageUrl ? (
                          <Image
                            src={variant.imageUrl}
                            alt={variant.product.name}
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Icon
                            icon="solar:box-bold-duotone"
                            className="h-6 w-6 text-text-secondary"
                            aria-label={variant.product.name}
                          />
                        )}
                      </div>
                    ))}

                    {remainingVariants > 0 && (
                      <span
                        title={`კიდევ ${remainingVariants} სახეობა`}
                        className="flex h-12 min-w-12 items-center justify-center rounded-xl border border-border bg-background px-2 text-sm font-semibold text-text-secondary sm:h-14 sm:min-w-14"
                      >
                        +{remainingVariants}
                      </span>
                    )}
                  </PurchaseProducts>

                  <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-text-secondary">
                      {variants.length} სახეობა
                      <span className="mx-2" aria-hidden="true">
                        ·
                      </span>
                      {quantity.toLocaleString("ka-GE")} ცალი
                    </p>

                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:justify-end">
                      <span className="text-xs text-text-secondary sm:text-sm">
                        პარტიის ღირებულება
                      </span>

                      <span className="break-all text-lg font-semibold tabular-nums text-text-primary">
                        {displayMoney(totalCost)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {totalPurchases > pageSize && (
          <nav
            aria-label="შესყიდვების გვერდები"
            className="mt-6 flex min-w-0 items-center justify-center gap-2"
          >
            {currentPage > 1 ? (
              <PaginationLink
                href={pageHref(currentPage - 1)}
                aria-label="წინა გვერდი"
                title="წინა გვერდი"
                className={paginationClass}
              >
                <Icon
                  icon="solar:alt-arrow-left-linear"
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </PaginationLink>
            ) : (
              <button
                type="button"
                disabled
                aria-label="წინა გვერდი"
                className="inline-flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-surface text-text-secondary opacity-40"
              >
                <Icon
                  icon="solar:alt-arrow-left-linear"
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </button>
            )}

            <span
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 text-sm tabular-nums sm:hidden"
              aria-label={`გვერდი ${currentPage}, სულ ${totalPages}`}
            >
              <span className="font-semibold text-text-primary">
                {currentPage}
              </span>
              <span className="text-text-secondary">
                / {totalPages}
              </span>
            </span>

            <div className="hidden items-center gap-1.5 sm:flex">
              {paginationItems.map((item) =>
                typeof item === "string" ? (
                  <span
                    key={item}
                    aria-hidden="true"
                    className="flex h-11 w-6 items-center justify-center text-text-secondary"
                  >
                    …
                  </span>
                ) : (
                  <PaginationLink
                    key={item}
                    href={pageHref(item)}
                    aria-label={`გვერდი ${item}`}
                    aria-current={
                      item === currentPage ? "page" : undefined
                    }
                    className={
                      item === currentPage
                        ? "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent bg-accent text-sm font-semibold tabular-nums text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        : `${paginationClass} tabular-nums`
                    }
                  >
                    {item}
                  </PaginationLink>
                ),
              )}
            </div>

            {currentPage < totalPages ? (
              <PaginationLink
                href={pageHref(currentPage + 1)}
                aria-label="შემდეგი გვერდი"
                title="შემდეგი გვერდი"
                className={paginationClass}
              >
                <Icon
                  icon="solar:alt-arrow-right-linear"
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </PaginationLink>
            ) : (
              <button
                type="button"
                disabled
                aria-label="შემდეგი გვერდი"
                className="inline-flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-surface text-text-secondary opacity-40"
              >
                <Icon
                  icon="solar:alt-arrow-right-linear"
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </button>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}