"use client";

import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import InventoryPicker from "@/components/dashboard/purchases/Inventory/InventoryPicker";

type PricingMethod =
    | "MANUAL"
    | "FIXED_PROFIT"
    | "MARKUP_PERCENT"
    | "MARGIN_PERCENT";

type ProductDraft = {
    id: string;
    sourceInventoryItemId: string | null;
    sourceProductId: string | null;
    name: string;
    category: string;
    brand: string;
    description: string;
    color: string;
    size: string;
    imageUrl: string;
    imageFile: File | null;
    imageAction: "keep" | "remove" | "upload";
    quantity: string;
    unitPurchasePrice: string;
    pricingMethod: PricingMethod;
    pricingValue: string;
};

type InventoryOption = {
    id: string;
    productId: string;
    sku: string;
    name: string;
    category: string;
    brand: string;
    description: string;
    color: string;
    size: string;
    imageUrl: string;
    currentStock: number;
    unitPurchasePrice: string;
    pricingMethod: PricingMethod;
    pricingValue: string;
};

const categoryOptions = [
    "ჩანთები",
    "ფეხსაცმელი",
    "ტანსაცმელი",
    "აქსესუარები",
    "სამკაულები",
    "საათები",
    "კოსმეტიკა და მოვლა",
    "პარფიუმერია",
    "ელექტრონიკა",
    "საყოფაცხოვრებო ტექნიკა",
    "სახლი და სამზარეულო",
    "ავეჯი",
    "სათამაშოები",
    "საბავშვო პროდუქტები",
    "სპორტი და დასვენება",
    "ავტონაწილები",
    "ავტომობილის აქსესუარები",
    "ხელსაწყოები",
    "წიგნები და საკანცელარიო",
    "საკვები და სასმელი",
    "ცხოველების პროდუქტები",
    "სხვა",
];

const colorOptions = [
    "შავი",
    "თეთრი",
    "ნაცრისფერი",
    "ვერცხლისფერი",
    "ოქროსფერი",
    "კრემისფერი",
    "ბეჟი",
    "ყავისფერი",
    "წითელი",
    "ვარდისფერი",
    "ნარინჯისფერი",
    "ყვითელი",
    "მწვანე",
    "ცისფერი",
    "ლურჯი",
    "იისფერი",
    "გამჭვირვალე",
    "ფერადი",
];

const inputClass =
    "h-9 lg:h-8 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";

const numberValue = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const money = (value: number) =>
    new Intl.NumberFormat("ka-GE", {
        style: "currency",
        currency: "GEL",
        maximumFractionDigits: 2,
    }).format(value);

function today() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function createProduct(): ProductDraft {
    return {
        id: crypto.randomUUID(),
        sourceInventoryItemId: null,
        sourceProductId: null,
        name: "",
        category: "",
        brand: "",
        description: "",
        color: "",
        size: "",
        imageUrl: "",
        imageFile: null,
        imageAction: "keep",
        quantity: "1",
        unitPurchasePrice: "",
        pricingMethod: "MANUAL",
        pricingValue: "",
    };
}

function Field({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-text-secondary">
            <span>{label}</span>
            {children}
        </label>
    );
}

function SummaryRow({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 text-sm">
            <span className="text-text-secondary">{label}</span>
            <span className="shrink-0 font-semibold text-text-primary">
                {value}
            </span>
        </div>
    );
}

function AnimatedProductCard({
    label,
    onRemove,
    children,
}: {
    label: string;
    onRemove: () => void;
    children: ReactNode;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const animations = useRef<Animation[]>([]);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        const card = cardRef.current;

        if (
            !card ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            return;
        }

        const animation = card.animate(
            [
                {
                    transform: "translateY(-60px) scale(0.92)",
                    opacity: 0,
                },
                {
                    transform: "translateY(0) scale(1)",
                    opacity: 1,
                },
            ],
            {
                duration: 650,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
        );

        animations.current.push(animation);

        return () => {
            animations.current.forEach((item) => item.cancel());
            animations.current = [];
        };
    }, []);

    function removeCard() {
        if (removing) return;

        const container = containerRef.current;
        const card = cardRef.current;

        if (!container || !card) return;

        if (
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            onRemove();
            return;
        }

        setRemoving(true);

        animations.current.forEach((item) => item.cancel());
        animations.current = [];

        const slide = card.animate(
            [
                {
                    transform: "translateX(0)",
                    opacity: 1,
                    borderColor: "#ef4444",
                },
                {
                    transform: "translateX(-105%)",
                    opacity: 0,
                    borderColor: "#ef4444",
                },
            ],
            {
                duration: 450,
                easing: "cubic-bezier(0.4, 0, 1, 1)",
                fill: "forwards",
            },
        );

        animations.current.push(slide);

        slide.onfinish = () => {
            const collapse = container.animate(
                [
                    {
                        height: `${container.getBoundingClientRect().height}px`,
                        marginBottom: "12px",
                    },
                    {
                        height: "0px",
                        marginBottom: "0px",
                    },
                ],
                {
                    duration: 250,
                    easing: "ease-in-out",
                    fill: "forwards",
                },
            );

            animations.current.push(collapse);
            collapse.onfinish = onRemove;
        };
    }

    return (
        <div
            ref={containerRef}
            className="mb-3 overflow-hidden"
        >
            <div
                ref={cardRef}
                className="purchase-product-card origin-top rounded-xl border border-border bg-background/50 p-3"
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-text-secondary">
                        {label}
                    </span>

                    <button
                        type="button"
                        disabled={removing}
                        aria-label={`${label} — წაშლა`}
                        onClick={removeCard}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-red-500/10 hover:text-red-500 disabled:cursor-wait"
                    >
                        <Icon
                            icon="solar:trash-bin-trash-linear"
                            className="h-4 w-4"
                        />
                    </button>
                </div>

                <fieldset
                    disabled={removing}
                    className="min-w-0 border-0 p-0"
                >
                    {children}
                </fieldset>
            </div>
        </div>
    );
}

export default function NewPurchasePanel({
    inventoryOptions,
}: {
    inventoryOptions: InventoryOption[];
}) {
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const [saving, setSaving] = useState(false);
    const [retryPending, setRetryPending] = useState(false);
    const [success, setSuccess] = useState("");

    const formRef = useRef<HTMLFormElement>(null);
    const requestLocked = useRef(false);
    const pendingSubmission = useRef<FormData | null>(null);

    const [name, setName] = useState("");
    const [date, setDate] = useState(today);
    const [note, setNote] = useState("");
    const [shipping, setShipping] = useState("0");
    const [customs, setCustoms] = useState("0");
    const [other, setOther] = useState("0");
    const [products, setProducts] = useState<ProductDraft[]>([]);

    const openButton = useRef<HTMLButtonElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const photoUrls = useRef(new Map<string, string>());

    const productsListRef = useRef<HTMLDivElement>(null);
    const pendingProductFocus = useRef(false);

    useEffect(() => {
        if (!saving && !retryPending) return;

        function warnBeforeLeaving(event: BeforeUnloadEvent) {
            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener("beforeunload", warnBeforeLeaving);

        return () => {
            window.removeEventListener(
                "beforeunload",
                warnBeforeLeaving,
            );
        };
    }, [saving, retryPending]);

    useEffect(() => {
        const urls = photoUrls.current;

        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    useEffect(() => {
        const activeIds = new Set(
            products.map((product) => product.id),
        );

        photoUrls.current.forEach((url, id) => {
            if (!activeIds.has(id)) {
                URL.revokeObjectURL(url);
                photoUrls.current.delete(id);
            }
        });
    }, [products]);

    useEffect(() => {
        if (!pendingProductFocus.current) return;

        pendingProductFocus.current = false;

        const list = productsListRef.current;
        if (!list) return;

        list.scrollTop = 0;

        const firstField = list.querySelector(
            "button[data-inventory-picker]",
        );

        if (firstField instanceof HTMLButtonElement) {
            firstField.focus({ preventScroll: true });
        }
    }, [products]);

    const productsTotal = products.reduce(
        (sum, product) =>
            sum +
            numberValue(product.quantity) *
            numberValue(product.unitPurchasePrice),
        0,
    );

    const quantity = products.reduce(
        (sum, product) => sum + numberValue(product.quantity),
        0,
    );

    const extraCost =
        numberValue(shipping) +
        numberValue(customs) +
        numberValue(other);

    const total = productsTotal + extraCost;

    useEffect(() => {
        return () => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
        };
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        let secondFrame = 0;

        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
                setVisible(true);
                heading.current?.focus({ preventScroll: true });
            });
        });

        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            document.body.style.overflow = previous;
        };
    }, [mounted]);

    function openPanel() {
        if (requestLocked.current || pendingSubmission.current) return;

        setSaving(false);
        setRetryPending(false);
        setSuccess("");

        if (closeTimer.current) clearTimeout(closeTimer.current);

        setName("");
        setDate(today());
        setNote("");
        setShipping("0");
        setCustoms("0");
        setOther("0");
        setProducts([createProduct()]);
        setError("");
        setDirty(false);
        setVisible(false);
        setMounted(true);
    }

    function closePanel() {
        if (requestLocked.current) return;

        if (pendingSubmission.current) {
            setError(
                "შენახვის შედეგი ჯერ დაუდასტურებელია. დააჭირე „ხელახლა ცდა“-ს.",
            );
            return;
        }

        if (
            dirty &&
            !window.confirm(
                "დახურავ ახალ პარტიას? შეყვანილი მონაცემები არ შეინახება.",
            )
        ) {
            return;
        }

        setVisible(false);

        const duration = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches
            ? 0
            : 1000;

        closeTimer.current = setTimeout(() => {
            setMounted(false);
            openButton.current?.focus();
        }, duration);
    }

    function updateProduct(
        id: string,
        patch: Partial<ProductDraft>,
    ) {
        setProducts((current) =>
            current.map((product) =>
                product.id === id ? { ...product, ...patch } : product,
            ),
        );
        setDirty(true);
        setError("");
    }

    function releasePhoto(id: string) {
        const previousUrl = photoUrls.current.get(id);

        if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
            photoUrls.current.delete(id);
        }
    }

    function selectInventoryItem(draftId: string, inventoryId: string) {
        releasePhoto(draftId);

        const item = inventoryOptions.find(
            (option) => option.id === inventoryId,
        );

        if (!item) {
            updateProduct(draftId, {
                ...createProduct(),
                id: draftId,
            });
            return;
        }

        updateProduct(draftId, {
            sourceInventoryItemId: item.id,
            sourceProductId: item.productId,
            name: item.name,
            category: item.category,
            brand: item.brand,
            description: item.description,
            color: item.color,
            size: item.size,
            imageUrl: item.imageUrl,
            imageFile: null,
            imageAction: "keep",
            unitPurchasePrice: item.unitPurchasePrice,
            pricingMethod: item.pricingMethod,
            pricingValue: item.pricingValue,
        });
    }

    function selectPhoto(id: string, file: File | undefined) {
        if (!file) return;

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            setError("აირჩიე JPG, PNG ან WebP ფოტო.");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError("ფოტოს ზომა მაქსიმუმ 5 MB უნდა იყოს.");
            return;
        }

        releasePhoto(id);

        const url = URL.createObjectURL(file);
        photoUrls.current.set(id, url);

        updateProduct(id, {
            imageUrl: url,
            imageFile: file,
            imageAction: "upload",
        });
    }

    async function handleSave() {
        if (requestLocked.current) return;

        setError("");

        let submission = pendingSubmission.current;

        if (!submission) {
            if (!formRef.current?.reportValidity()) return;

            if (products.length === 0) {
                setError("დაამატე მინიმუმ ერთი პროდუქტი.");
                return;
            }

            if (
                products.some(
                    (product) =>
                        !product.name.trim() ||
                        !product.category.trim() ||
                        !product.pricingValue.trim(),
                )
            ) {
                setError(
                    "ყველა პროდუქტზე შეავსე სახელი, კატეგორია და გასაყიდი ფასის პარამეტრი.",
                );
                return;
            }

            const imageActions = products.map(
                (product) => product.imageAction,
            );

            const purchase = {
                name,
                note,
                purchaseDate: date,
                shippingCost: shipping,
                customsCost: customs,
                otherCost: other,

                items: products.map((product) => ({
                    sourceInventoryItemId:
                        product.sourceInventoryItemId,
                    name: product.name,
                    brand: product.brand,
                    category: product.category,
                    description: product.description,
                    color: product.color,
                    size: product.size,
                    quantity: product.quantity,
                    unitPurchasePrice: product.unitPurchasePrice,
                    pricingMethod: product.pricingMethod,
                    pricingValue: product.pricingValue,
                })),
            };

            const payload = JSON.stringify({
                requestId: crypto.randomUUID(),
                purchase,
                imageActions,
            });

            const payloadSize = new TextEncoder().encode(payload).byteLength;

            if (payloadSize > 1024 * 1024) {
                setError("პარტიის ტექსტური მონაცემები ზედმეტად დიდია.");
                return;
            }

            let totalSize = payloadSize;
            submission = new FormData();
            submission.set("payload", payload);

            for (const [index, product] of products.entries()) {
                if (product.imageAction !== "upload") continue;

                if (!product.imageFile) {
                    setError(
                        `პროდუქტი ${index + 1}: თავიდან აირჩიე ფოტო.`,
                    );
                    return;
                }

                if (product.imageFile.size > 5 * 1024 * 1024) {
                    setError(
                        `პროდუქტი ${index + 1}: ფოტოს მაქსიმალური ზომაა 5 MB.`,
                    );
                    return;
                }

                totalSize += product.imageFile.size;

                submission.set(
                    `image-${index}`,
                    product.imageFile,
                );
            }

            // სივრცე მოთხოვნის ტექნიკური მონაცემებისთვისაც რჩება.
            if (totalSize > 25 * 1024 * 1024 - 256 * 1024) {
                setError(
                    "ფოტოების საერთო ზომა ზედმეტად დიდია. შეამცირე ფოტოების ზომა.",
                );
                return;
            }

            pendingSubmission.current = submission;
        }

        requestLocked.current = true;
        setSaving(true);
        setRetryPending(false);

        try {
            const response = await fetch("/api/purchases", {
                method: "POST",
                credentials: "same-origin",
                body: submission,
            });

            const rawData: unknown = await response.json().catch(() => null);

            const body =
                typeof rawData === "object" &&
                    rawData !== null &&
                    !Array.isArray(rawData)
                    ? (rawData as Record<string, unknown>)
                    : null;

            const rawPurchase = body?.purchase;

            const purchaseResult =
                typeof rawPurchase === "object" &&
                    rawPurchase !== null &&
                    !Array.isArray(rawPurchase)
                    ? (rawPurchase as Record<string, unknown>)
                    : null;

            const data = {
                success: body?.success === true,
                error:
                    typeof body?.error === "string"
                        ? body.error
                        : undefined,
                purchase: {
                    id:
                        typeof purchaseResult?.id === "string"
                            ? purchaseResult.id
                            : undefined,
                    number:
                        typeof purchaseResult?.number === "number"
                            ? purchaseResult.number
                            : undefined,
                },
            };

            if (!response.ok) {
                const rejectedWithoutSaving = [
                    400,
                    401,
                    403,
                    413,
                    422,
                ].includes(response.status);

                if (rejectedWithoutSaving) {
                    pendingSubmission.current = null;
                    setRetryPending(false);
                } else {
                    setRetryPending(true);
                }

                setError(
                    data?.error ||
                    (rejectedWithoutSaving
                        ? "მოთხოვნა ვერ დამუშავდა. გადაამოწმე მონაცემები."
                        : "შენახვის შედეგი ვერ დადასტურდა. დააჭირე „ხელახლა ცდა“-ს."),
                );
                return;
            }

            if (
                data?.success !== true ||
                typeof data.purchase?.id !== "string" ||
                typeof data.purchase.number !== "number"
            ) {
                setRetryPending(true);
                setError(
                    "შენახვის პასუხი ვერ დადასტურდა. დააჭირე „ხელახლა ცდა“-ს.",
                );
                return;
            }

            pendingSubmission.current = null;
            setRetryPending(false);
            setDirty(false);

            setSuccess(
                `პარტია #${String(data.purchase.number).padStart(3, "0")} დამატებულია`,
            );

            // წარმატების შემდეგ ვხურავთ დადასტურების კითხვის გარეშე.
            setVisible(false);

            const duration = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches
                ? 0
                : 1000;

            closeTimer.current = setTimeout(() => {
                setMounted(false);
                setProducts([]);
                openButton.current?.focus();
                router.refresh();
            }, duration);
        } catch {
            setRetryPending(true);
            setError(
                "სერვერთან კავშირი შეწყდა. შედეგის დასადასტურებლად დააჭირე „ხელახლა ცდა“-ს.",
            );
        } finally {
            requestLocked.current = false;
            setSaving(false);
        }
    }

    function unitCost(product: ProductDraft) {
        const price = numberValue(product.unitPurchasePrice);

        return productsTotal > 0
            ? price + (price / productsTotal) * extraCost
            : price;
    }

    function salePrice(product: ProductDraft) {
        const cost = unitCost(product);
        const value = numberValue(product.pricingValue);

        switch (product.pricingMethod) {
            case "FIXED_PROFIT":
                return cost + value;
            case "MARKUP_PERCENT":
                return cost * (1 + value / 100);
            case "MARGIN_PERCENT":
                return value < 100 ? cost / (1 - value / 100) : null;
            default:
                return value;
        }
    }

    return (
        <>
            <button
                ref={openButton}
                type="button"
                onClick={openPanel}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white transition hover:bg-emerald-700"            >
                <Icon
                    icon="solar:add-circle-bold-duotone"
                    className="h-5 w-5"
                />
                ახალი პარტია
            </button>

            {success && !mounted && (
                <p
                    role="status"
                    className="text-sm font-medium text-emerald-600"
                >
                    {success}
                </p>
            )}

            {mounted && (
                <section
                    aria-labelledby="new-purchase-title"
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.stopPropagation();
                            closePanel();
                        }
                    }}
                    className={[
                        "fixed inset-x-0 bottom-0 top-16 z-30",
                        "flex origin-bottom flex-col overflow-hidden bg-background",
                        "lg:left-[280px]",
                        "transition-[translate,scale,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        "motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:scale-100",
                        visible
                            ? "translate-y-0 scale-100 opacity-100"
                            : "translate-y-full scale-[0.85] opacity-0",
                    ].join(" ")}
                >
                    {/* სათაური */}
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 sm:px-5">
                        <h2
                            id="new-purchase-title"
                            ref={heading}
                            tabIndex={-1}
                            className="text-lg font-semibold text-text-primary outline-none"
                        >
                            ახალი პარტია
                        </h2>

                        <button
                            type="button"
                            onClick={closePanel}
                            aria-label="პარტიის დახურვა"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition hover:bg-background"
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-5 w-5"
                            />
                        </button>
                    </div>

                    <form
                        ref={formRef}
                        id="new-purchase-form"
                        inert={saving || retryPending || !visible}
                        aria-busy={saving}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleSave();
                        }}
                        onChange={() => {
                            setDirty(true);
                            setError("");
                        }}
                        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-4 lg:overflow-hidden"
                    >
                        {/* პარტიის ძირითადი ინფორმაცია */}
                        <div className="mb-3 grid shrink-0 grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                            <Field label="პარტიის სახელი">
                                <input
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    maxLength={200}
                                    className={inputClass}
                                />
                            </Field>

                            <Field label="თარიღი">
                                <input
                                    type="date"
                                    required
                                    value={date}
                                    onChange={(event) =>
                                        setDate(event.target.value)
                                    }
                                    className={inputClass}
                                />
                            </Field>
                        </div>

                        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_290px]">
                            {/* პროდუქტები */}
                            <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
                                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                                    <h3 className="text-sm font-semibold">
                                        პროდუქტები
                                        <span className="ml-2 text-xs font-normal text-text-secondary">
                                            {products.length}
                                        </span>
                                    </h3>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            pendingProductFocus.current = true;

                                            setProducts((current) => [
                                                createProduct(),
                                                ...current,
                                            ]);

                                            setDirty(true);
                                        }}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white transition hover:bg-emerald-700"                                    >
                                        <Icon
                                            icon="solar:add-circle-linear"
                                            className="h-4 w-4"
                                        />
                                        პროდუქტი
                                    </button>
                                </div>

                                <div
                                    ref={productsListRef}
                                    className="overflow-x-hidden p-2 sm:p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
                                    style={{ overflowAnchor: "none" }}
                                >                                    {products.length === 0 && (
                                    <div className="flex min-h-32 items-center justify-center text-sm text-text-secondary">
                                        პროდუქტები არ არის დამატებული
                                    </div>
                                )}

                                    {products.map((product, index) => {
                                        const cost = unitCost(product);
                                        const price = salePrice(product);
                                        const hasPrice =
                                            product.pricingValue.trim() !== "";

                                        return (
                                            <AnimatedProductCard
                                                key={product.id}
                                                label={`პროდუქტი ${products.length - index}${product.name.trim() ? ` — ${product.name.trim()}` : ""
                                                    }`}
                                                onRemove={() => {
                                                    setProducts((current) =>
                                                        current.filter((item) => item.id !== product.id),
                                                    );
                                                    setDirty(true);
                                                }}
                                            >

                                                <div className="mb-3 min-w-0">
                                                    <InventoryPicker
                                                        options={inventoryOptions}
                                                        value={product.sourceInventoryItemId}
                                                        onChange={(id) =>
                                                            selectInventoryItem(product.id, id)
                                                        }
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                                    <div className="col-span-2 lg:col-span-1">
                                                        <Field label="სახელი *">
                                                            <input
                                                                required
                                                                value={product.name}
                                                                onChange={(event) =>
                                                                    updateProduct(product.id, {
                                                                        name: event.target.value,
                                                                    })
                                                                }
                                                                className={inputClass}
                                                            />
                                                        </Field>
                                                    </div>

                                                    <div className="col-span-2 lg:col-span-1">
                                                        <Field label="ბრენდი">
                                                            <input
                                                                value={product.brand}
                                                                onChange={(event) =>
                                                                    updateProduct(product.id, {
                                                                        brand: event.target.value,
                                                                    })
                                                                }
                                                                className={inputClass}
                                                            />
                                                        </Field>
                                                    </div>

                                                    <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-start gap-2 lg:grid-cols-2">
                                                        <Field label="კატეგორია *">
                                                            <select
                                                                required
                                                                value={product.category}
                                                                onChange={(event) =>
                                                                    updateProduct(product.id, {
                                                                        category: event.target.value,
                                                                    })
                                                                }
                                                                className={inputClass}
                                                            >
                                                                <option value="" disabled>
                                                                    აირჩიე კატეგორია
                                                                </option>

                                                                {product.category &&
                                                                    !categoryOptions.includes(product.category) && (
                                                                        <option value={product.category}>
                                                                            {product.category}
                                                                        </option>
                                                                    )}

                                                                {categoryOptions.map((category) => (
                                                                    <option key={category} value={category}>
                                                                        {category}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </Field>

                                                        <div className="flex min-w-0 flex-col gap-1.5">
                                                            <span className="text-xs font-medium text-text-secondary">
                                                                ფოტო
                                                            </span>

                                                            <label className="relative flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-lg bg-emerald-600 px-1 text-xs font-medium text-white transition hover:bg-emerald-700 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 focus-within:ring-offset-surface lg:h-8">
                                                                <Icon
                                                                    icon={
                                                                        product.imageUrl
                                                                            ? "solar:gallery-edit-linear"
                                                                            : "solar:camera-add-linear"
                                                                    }
                                                                    className="h-4 w-4 shrink-0"
                                                                />

                                                                <span>ფოტო</span>

                                                                <input
                                                                    type="file"
                                                                    accept="image/jpeg,image/png,image/webp"
                                                                    aria-label={
                                                                        product.imageUrl
                                                                            ? "პროდუქტის ფოტოს შეცვლა"
                                                                            : "პროდუქტის ფოტოს დამატება"
                                                                    }
                                                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                                    onChange={(event) => {
                                                                        selectPhoto(
                                                                            product.id,
                                                                            event.target.files?.[0],
                                                                        );
                                                                        event.target.value = "";
                                                                    }}
                                                                />
                                                            </label>

                                                            {product.imageUrl && (
                                                                <div className="flex flex-wrap items-center gap-1">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={product.imageUrl}
                                                                        alt={product.name || "პროდუქტის ფოტო"}
                                                                        className="h-8 w-8 rounded-md border border-border object-cover"
                                                                    />

                                                                    <button
                                                                        type="button"
                                                                        aria-label="პროდუქტის ფოტოს წაშლა"
                                                                        title="ფოტოს წაშლა"
                                                                        onClick={() => {
                                                                            releasePhoto(product.id);
                                                                            updateProduct(product.id, {
                                                                                imageUrl: "",
                                                                                imageFile: null,
                                                                                imageAction: "remove",
                                                                            });
                                                                        }}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 transition hover:bg-red-500/10"
                                                                    >
                                                                        <Icon
                                                                            icon="solar:trash-bin-trash-linear"
                                                                            className="h-4 w-4"
                                                                        />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="col-span-2 lg:col-span-4">
                                                        <Field label="აღწერა">
                                                            <input
                                                                value={product.description}
                                                                onChange={(event) =>
                                                                    updateProduct(product.id, {
                                                                        description: event.target.value,
                                                                    })
                                                                }
                                                                className={inputClass}
                                                            />
                                                        </Field>
                                                    </div>

                                                    <Field label="ფერი">
                                                        <select
                                                            value={product.color}
                                                            onChange={(event) =>
                                                                updateProduct(product.id, {
                                                                    color: event.target.value,
                                                                })
                                                            }
                                                            className={inputClass}
                                                        >
                                                            <option value="">არ არის მითითებული</option>

                                                            {product.color && !colorOptions.includes(product.color) && (
                                                                <option value={product.color}>
                                                                    {product.color}
                                                                </option>
                                                            )}

                                                            {colorOptions.map((color) => (
                                                                <option key={color} value={color}>
                                                                    {color}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </Field>

                                                    <Field label="ზომა">
                                                        <input
                                                            value={product.size}
                                                            onChange={(event) =>
                                                                updateProduct(product.id, {
                                                                    size: event.target.value,
                                                                })
                                                            }
                                                            className={inputClass}
                                                        />
                                                    </Field>

                                                    <Field label="რაოდენობა *">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="1"
                                                            required
                                                            value={product.quantity}
                                                            onChange={(event) =>
                                                                updateProduct(product.id, {
                                                                    quantity: event.target.value,
                                                                })
                                                            }
                                                            className={inputClass}
                                                        />
                                                    </Field>

                                                    <Field label="შესყიდვა / ცალი · ₾ *">
                                                        <input
                                                            type="number"
                                                            min="0.01"
                                                            step="0.01"
                                                            required
                                                            value={product.unitPurchasePrice}
                                                            onChange={(event) =>
                                                                updateProduct(product.id, {
                                                                    unitPurchasePrice:
                                                                        event.target.value,
                                                                })
                                                            }
                                                            className={inputClass}
                                                        />
                                                    </Field>

                                                    <div className="col-span-2 xl:col-span-3">
                                                        <Field label="გასაყიდი ფასის განსაზღვრა">
                                                            <select
                                                                value={product.pricingMethod}
                                                                onChange={(event) =>
                                                                    updateProduct(product.id, {
                                                                        pricingMethod:
                                                                            event.target
                                                                                .value as PricingMethod,
                                                                        pricingValue: "",
                                                                    })
                                                                }
                                                                className={inputClass}
                                                            >
                                                                <option value="MANUAL">
                                                                    ხელით მითითება
                                                                </option>
                                                                <option value="FIXED_PROFIT">
                                                                    ფიქსირებული მოგება · ₾
                                                                </option>
                                                                <option value="MARKUP_PERCENT">
                                                                    ფასნამატი · %
                                                                </option>
                                                                <option value="MARGIN_PERCENT">
                                                                    მარჟა · %
                                                                </option>
                                                            </select>
                                                        </Field>
                                                    </div>

                                                    <div className="col-span-2 xl:col-span-1">
                                                        <Field
                                                            label={
                                                                product.pricingMethod === "MANUAL"
                                                                    ? "გასაყიდი ფასი · ₾"
                                                                    : product.pricingMethod ===
                                                                        "FIXED_PROFIT"
                                                                        ? "მოგება · ₾"
                                                                        : "პროცენტი · %"
                                                            }
                                                        >
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={
                                                                    product.pricingMethod ===
                                                                        "MARGIN_PERCENT"
                                                                        ? "99.99"
                                                                        : undefined
                                                                }
                                                                step="0.01"
                                                                value={product.pricingValue}
                                                                onChange={(event) =>
                                                                    updateProduct(product.id, {
                                                                        pricingValue:
                                                                            event.target.value,
                                                                    })
                                                                }
                                                                className={inputClass}
                                                            />
                                                        </Field>
                                                    </div>
                                                </div>

                                                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-3">
                                                    <div className="rounded-lg bg-surface px-2.5 py-2">
                                                        <p className="text-[11px] text-text-secondary">
                                                            თვითღირებულება / ცალი
                                                        </p>
                                                        <p className="mt-1 text-sm font-semibold">
                                                            {money(cost)}
                                                        </p>
                                                    </div>

                                                    <div className="rounded-lg bg-surface px-2.5 py-2">
                                                        <p className="text-[11px] text-text-secondary">
                                                            გასაყიდი ფასი
                                                        </p>
                                                        <p className="mt-1 text-sm font-semibold">
                                                            {!hasPrice || price === null
                                                                ? "—"
                                                                : money(price)}
                                                        </p>
                                                    </div>

                                                    <div className="rounded-lg bg-accent/10 px-2.5 py-2">
                                                        <p className="text-[11px] text-text-secondary">
                                                            სხვაობა / ცალი
                                                        </p>
                                                        <p className="mt-1 text-sm font-semibold text-accent">
                                                            {!hasPrice || price === null
                                                                ? "—"
                                                                : money(price - cost)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {price === null && (
                                                    <p
                                                        role="alert"
                                                        className="mt-2 text-xs text-red-500"
                                                    >
                                                        მარჟა 100%-ზე ნაკლები უნდა იყოს.
                                                    </p>
                                                )}
                                            </AnimatedProductCard>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ხარჯები და შეჯამება */}
                            <aside className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
                                <div className="rounded-xl border border-border bg-surface p-3">
                                    <h3 className="mb-3 text-sm font-semibold">
                                        დამატებითი ხარჯები
                                    </h3>

                                    <div className="space-y-2.5">
                                        {[
                                            {
                                                label: "ტრანსპორტირება · ₾",
                                                value: shipping,
                                                set: setShipping,
                                            },
                                            {
                                                label: "განბაჟება · ₾",
                                                value: customs,
                                                set: setCustoms,
                                            },
                                            {
                                                label: "სხვა ხარჯი · ₾",
                                                value: other,
                                                set: setOther,
                                            },
                                        ].map((field) => (
                                            <Field
                                                key={field.label}
                                                label={field.label}
                                            >
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0"
                                                    value={field.value}
                                                    onFocus={() => {
                                                        if (field.value === "0") {
                                                            field.set("");
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (!field.value.trim()) {
                                                            field.set("0");
                                                        }
                                                    }}
                                                    onChange={(event) => {
                                                        const value = event.target.value;

                                                        field.set(
                                                            value.replace(/^0+(?=\d)/, ""),
                                                        );
                                                    }}
                                                    className={inputClass}
                                                />
                                            </Field>
                                        ))}

                                        <Field label="შენიშვნა">
                                            <textarea
                                                value={note}
                                                onChange={(event) =>
                                                    setNote(event.target.value)
                                                }
                                                rows={2}
                                                maxLength={2000}
                                                className={`${inputClass} h-auto resize-none py-2`}
                                            />
                                        </Field>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border bg-surface p-3">
                                    <h3 className="mb-3 text-sm font-semibold">
                                        პარტიის შეჯამება
                                    </h3>

                                    <dl className="space-y-3 text-xs">
                                        {[
                                            {
                                                label: "რაოდენობა",
                                                value: `${quantity} ცალი`,
                                            },
                                            {
                                                label: "პროდუქტების ღირებულება",
                                                value: money(productsTotal),
                                            },
                                            {
                                                label: "დამატებითი ხარჯები",
                                                value: money(extraCost),
                                            },
                                        ].map((row) => (
                                            <div
                                                key={row.label}
                                                className="flex flex-wrap items-center justify-between gap-2"
                                            >
                                                <dt className="text-text-secondary">
                                                    {row.label}
                                                </dt>
                                                <dd className="font-semibold">
                                                    {row.value}
                                                </dd>
                                            </div>
                                        ))}

                                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent/10 p-3 text-accent">
                                            <dt className="font-medium">
                                                სრული ღირებულება
                                            </dt>
                                            <dd className="text-base font-semibold">
                                                {money(total)}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            </aside>
                        </div>
                    </form>

                    {/* მუდმივად ხილული მოქმედებები */}
                    <footer className="shrink-0 border-t border-border bg-surface px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5">
                        {error && (
                            <p
                                role="alert"
                                className="mb-2 text-xs text-red-500"
                            >
                                {error}
                            </p>
                        )}

                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={closePanel}
                                className="h-10 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-background"
                            >
                                გაუქმება
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={saving || !visible}
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Icon
                                    icon={
                                        saving
                                            ? "solar:refresh-linear"
                                            : "solar:check-circle-bold-duotone"
                                    }
                                    className={[
                                        "h-4 w-4",
                                        saving ? "animate-spin motion-reduce:animate-none" : "",
                                    ].join(" ")}
                                />

                                {saving
                                    ? "ინახება..."
                                    : retryPending
                                        ? "ხელახლა ცდა"
                                        : "პარტიის შენახვა"}
                            </button>
                        </div>
                    </footer>
                </section>
            )}
        </>
    );
}
