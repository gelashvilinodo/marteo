"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PurchasesListSkeleton from "./PurchasesListSkeleton";
import type { PurchasesSnapshot } from "@/lib/purchases/get-purchases-snapshot";
import { PURCHASES_CHANGED } from "@/lib/purchases/refresh-purchases-client";
import NewPurchasePanel from "./NewPurchasePanel";
import PurchaseProducts from "./PurchaseProducts";
import PurchaseFiltersDisclosure from "./PurchaseFiltersDisclosure";
import ReceivePurchaseButton from "./ReceivePurchaseButton";
import PurchaseActionButton from "./PurchaseActionButton";
import PaginationLink from "./PaginationLink";
import Image from "next/image";
import { Icon } from "@iconify/react";
import Link from "next/link";
function displayMoney(value: string) {
  const [integer, decimal] = value.split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${decimal} ₾`;
}
export default function PurchasesView({ initialSnapshot }: { initialSnapshot: PurchasesSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [previous, setPrevious] = useState(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [filterResetKey, setFilterResetKey] = useState(0);

  const listLoading = refreshing || navigating;

  function navigateList(href: string) {
    setError("");

    startNavigation(() => {
      const destination = new URL(href, window.location.origin);
      const current = new URL(window.location.href);

      if (
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        router.refresh();
      } else {
        router.push(href, { scroll: false });
      }
    });
  }
  if (previous !== initialSnapshot) { setPrevious(initialSnapshot); setSnapshot(initialSnapshot); setRefreshing(false); setError(""); }
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function changed(event: Event) {
      event.preventDefault();
      controller?.abort();
      if (timer) clearTimeout(timer);
      setRefreshing(true);
      timer = setTimeout(() => {
        timer = null;
        const request = new AbortController(); controller = request;
        const search = window.location.search;
        void (async () => {
          try {
            const response = await fetch(`/api/purchases/list${search}`, { cache: "no-store", credentials: "same-origin", signal: request.signal });
            const body = await response.json() as { success?: boolean; data?: PurchasesSnapshot; message?: string };
            if (!response.ok || !body.success || !Array.isArray(body.data?.purchases) || !Array.isArray(body.data.inventoryOptions) || !body.data.attributeOptions) {
              throw new Error(body.message || "პარტიების სია ვერ განახლდა.");
            }
            if (!active || request.signal.aborted || window.location.search !== search) return;
            setSnapshot(body.data); setError("");
            const params = new URLSearchParams(search);
            if (body.data.currentPage > 1) params.set("page", String(body.data.currentPage)); else params.delete("page");
            window.history.replaceState(window.history.state, "", `/dashboard/purchases${params.size ? `?${params}` : ""}${window.location.hash}`);
          } catch (cause) {
            if (active && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "პარტიები ვერ განახლდა.");
          } finally { if (active && controller === request && !request.signal.aborted) setRefreshing(false); }
        })();
      }, 0);
    }
    window.addEventListener(PURCHASES_CHANGED, changed);
    return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); window.removeEventListener(PURCHASES_CHANGED, changed); };
  }, [initialSnapshot]);
  const { view, isArchive, query, from, to, filterError, hasFilters, totalPurchases, currentPage, totalPages, pageSize, paginationItems, purchases, inventoryOptions, attributeOptions } = snapshot;
  const paginationClass = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-sm font-medium text-text-primary transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  function pageHref(page: number) {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    if (page > 1) search.set("page", String(page));

    const suffix = search.toString();

    return `/dashboard/purchases${suffix ? `?${suffix}` : ""}`;
  }

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">
            შესყიდვები
          </h1>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
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
          <form
            key={`${query}|${from}|${to}|${filterResetKey}`}
            onSubmit={event => {
              event.preventDefault();
              if (listLoading) return;

              const values = new FormData(event.currentTarget);
              const params = new URLSearchParams();

              const search = String(values.get("q") ?? "").trim();
              const start = String(values.get("from") ?? "").trim();
              const end = String(values.get("to") ?? "").trim();

              if (search) params.set("q", search);
              if (start) params.set("from", start);
              if (end) params.set("to", end);

              navigateList(
                `/dashboard/purchases${params.size ? `?${params}` : ""}`,
              );
            }}
            className="border-t border-border p-3 sm:border-t-0 sm:p-4"
          >
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
                disabled={listLoading}
                aria-busy={listLoading}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-white transition hover:opacity-90 sm:col-span-2 xl:col-span-1"
              >
                ძებნა
              </button>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={listLoading}
                onClick={() => {
                  setFilterResetKey(value => value + 1);
                  navigateList("/dashboard/purchases");
                }}
                className="inline-flex min-h-9 items-center text-sm text-text-secondary underline underline-offset-4 hover:text-accent disabled:opacity-50"
              >
                გასუფთავება
              </button>
            </div>

            {filterError && (
              <p role="alert" className="mt-3 text-sm text-red-500">
                {filterError}
              </p>
            )}
          </form>
        </PurchaseFiltersDisclosure>

        {error && <p role="alert" className="mt-4 text-sm text-danger">{error} <button type="button" className="underline" onClick={() => window.dispatchEvent(new Event(PURCHASES_CHANGED, { cancelable: true }))}>სიის განახლება</button></p>}
        <p className="mt-4 min-h-5 text-sm text-text-secondary">
          {listLoading ? (
            <span
              aria-hidden="true"
              className="block h-5 w-24 animate-pulse rounded bg-text-secondary/10 motion-reduce:animate-none"
            />
          ) : (
            `${totalPurchases} პარტია`
          )}
        </p>

        {listLoading && <PurchasesListSkeleton />}

        <div
          aria-busy={listLoading}
          className={listLoading ? "hidden" : "mt-6 space-y-4"}
        >
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

              const productsCost = purchase.productsCost;
              const totalCost = purchase.totalCost;

              const number = String(purchase.number).padStart(
                3,
                "0",
              );

              const date = purchase.dateLabel;

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
                        dateTime={purchase.purchaseDate}
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
                      {purchase.archivedAt === null ? (
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
                          title="რედაქტირებისთვის ჯერ აღადგინე პარტია არქივიდან"
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
                            .filter((expense) => !/^-?0\.00$/.test(expense.value))
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

        {!listLoading && totalPurchases > pageSize && (
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
