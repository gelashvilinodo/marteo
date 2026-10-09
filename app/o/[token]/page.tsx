import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Icon } from "@iconify/react";
import { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    title: "შეკვეთის დეტალები | MARTEO",
    description: "მაღაზიისა და თქვენი შეკვეთის ინფორმაცია.",
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
};

const statuses = {
    PROCESSING: { label: "მუშავდება", description: "მაღაზია ამზადებს თქვენს შეკვეთას.", icon: "solar:clock-circle-linear", tone: "text-warning bg-warning/10" },
    SHIPPED: { label: "გაგზავნილი", description: "თქვენი შეკვეთა გაგზავნილია.", icon: "solar:delivery-linear", tone: "text-accent bg-accent/10" },
    COMPLETED: { label: "დასრულებული", description: "თქვენი შეკვეთა დასრულებულია.", icon: "solar:check-circle-linear", tone: "text-success bg-success/10" },
    CANCELED: { label: "გაუქმებული", description: "თქვენი შეკვეთა გაუქმებულია.", icon: "solar:close-circle-linear", tone: "text-danger bg-danger/10" },
    RETURNED: {
        label: "დაბრუნებული",
        description: "შეკვეთის პროდუქტების დაბრუნება დადასტურებულია.",
        icon: "solar:undo-left-round-linear",
        tone: "text-accent bg-accent/10",
    },
};
const paymentLabels = {
    PAID: "გადახდილი", UNPAID: "გადაუხდელი",
    PARTIALLY_PAID: "ნაწილობრივ გადახდილი", COURIER_ONLY_PAID: "გადახდილია მხოლოდ კურიერის საფასური",
};

async function getPublicOrder(token: string) {
    const prisma = createPrismaClient();
    try {
        return await prisma.order.findFirst({
            where: { publicAccessToken: token, deletedAt: null },
            select: {
                number: true,
                createdAt: true,
                status: true,
                paymentStatus: true,
                courierFee: true,
                business: { select: { name: true, logoUrl: true, phone: true, email: true } },
                items: {
                    where: { isActive: true },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: {
                        name: true,
                        color: true,
                        size: true,
                        imageUrl: true,
                        quantity: true,
                        unitPrice: true,
                        condition: true,
                    },
                },
                payments: { select: { amount: true } },
            },
        });
    } finally {
        await prisma.$disconnect();
    }
}

function formatDate(value: Date) {
    const local = new Date(value.getTime() + 4 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.${local.getUTCFullYear()}`;
}
function money(value: Prisma.Decimal) { return `${value.toFixed(2)} ₾`; }

export default async function PublicOrderPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!/^[0-9a-f]{64}$/.test(token)) notFound();
    const order = await getPublicOrder(token);
    if (!order) notFound();

    const status = statuses[order.status];
    const productsTotal = order.items.reduce((sum, item) => sum.plus(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));
    const total = productsTotal.plus(order.courierFee);
    const paid = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    const remaining = Prisma.Decimal.max(
        total.minus(paid),
        0,
    );

    const refundDue = Prisma.Decimal.max(
        paid.minus(total),
        0,
    );

    return <main className="min-h-dvh bg-background px-4 py-6 text-text-primary sm:py-10">
        <div className="mx-auto max-w-2xl space-y-4">
            <header className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
                <div className="flex min-w-0 items-center gap-3">
                    {order.business.logoUrl
                        ? <Image src={order.business.logoUrl} alt={`${order.business.name} — ლოგო`} width={56} height={56} unoptimized className="h-14 w-14 shrink-0 rounded-xl border border-border bg-white object-contain p-1" />
                        : <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-2xl font-semibold text-accent">{Array.from(order.business.name.trim())[0] || "M"}</span>}
                    <div className="min-w-0">
                        <h1 className="break-words text-xl font-semibold sm:text-2xl">{order.business.name}</h1>
                        <p className="mt-1 text-sm text-text-secondary">თქვენი შეკვეთის ინფორმაცია</p>
                    </div>
                </div>
                {(order.business.phone || order.business.email) && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
                    {order.business.phone && <a href={`tel:${order.business.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-text-secondary hover:text-accent"><Icon icon="solar:phone-linear" className="h-4 w-4" />{order.business.phone}</a>}
                    {order.business.email && <a href={`mailto:${order.business.email}`} className="inline-flex min-w-0 items-center gap-1.5 break-all text-text-secondary hover:text-accent"><Icon icon="solar:letter-linear" className="h-4 w-4 shrink-0" />{order.business.email}</a>}
                </div>}
            </header>

            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-labelledby="public-order-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="public-order-heading" className="text-lg font-semibold">შეკვეთა{order.number !== null ? ` #${String(order.number).padStart(4, "0")}` : ""}</h2>
                    <span className="text-sm text-text-secondary">{formatDate(order.createdAt)}</span>
                </div>
                <div className={`mt-4 flex items-start gap-3 rounded-xl p-3 ${status.tone}`}>
                    <Icon icon={status.icon} className="mt-0.5 h-6 w-6 shrink-0" />
                    <div><p className="font-semibold">{status.label}</p><p className="mt-1 text-sm text-text-secondary">{status.description}</p></div>
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-labelledby="public-items-heading">
                <h2 id="public-items-heading" className="flex items-center gap-2 font-semibold"><Icon icon="solar:box-linear" className="h-5 w-5 text-accent" />პროდუქტები</h2>
                <ul className="mt-3 divide-y divide-border">
                    {order.items.map((item, index) => <li key={index} className="flex min-w-0 items-start gap-3 py-3">
                        {item.imageUrl
                            ? <Image src={item.imageUrl} alt={item.name} width={56} height={56} unoptimized className="h-14 w-14 shrink-0 rounded-xl border border-border bg-background object-contain" />
                            : <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background text-text-secondary"><Icon icon="solar:box-linear" className="h-6 w-6" /></span>}
                        <div className="min-w-0 flex-1">
                            <h3 className="break-words text-sm font-medium">{item.name}</h3>
                            {item.condition === "DEFECTIVE" && <span className="mt-1 inline-block rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">წუნდებული</span>}
                            {(item.color || item.size) && <p className="mt-1 break-words text-xs text-text-secondary">{[item.color, item.size].filter(Boolean).join(" · ")}</p>}
                            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm tabular-nums"><span className="text-text-secondary">{item.quantity} × {money(item.unitPrice)}</span><span className="font-semibold">{money(item.unitPrice.mul(item.quantity))}</span></div>
                        </div>
                    </li>)}
                </ul>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-labelledby="public-payment-heading">
                <h2 id="public-payment-heading" className="flex items-center gap-2 font-semibold"><Icon icon="solar:wallet-linear" className="h-5 w-5 text-accent" />თანხის შეჯამება</h2>
                <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-text-secondary">პროდუქტები</dt><dd className="tabular-nums">{money(productsTotal)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-text-secondary">მიწოდება</dt><dd className="tabular-nums">{money(order.courierFee)}</dd></div>
                    <div className="flex justify-between gap-3 border-t border-border pt-3 text-lg font-semibold"><dt>სულ</dt><dd className="tabular-nums">{money(total)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-text-secondary">გადახდილი</dt><dd className="tabular-nums text-success">{money(paid)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-text-secondary">დარჩენილი თანხა</dt><dd className="font-semibold tabular-nums">{money(remaining)}</dd></div>
                    {refundDue.greaterThan(0) && (
                        <div className="flex justify-between gap-3">
                            <dt className="text-text-secondary">
                                დასაბრუნებელი თანხა
                            </dt>
                            <dd className="font-semibold tabular-nums text-warning">
                                {money(refundDue)}
                            </dd>
                        </div>
                    )}
                </dl>
                <p className="mt-4 rounded-xl bg-background px-3 py-2 text-sm text-text-secondary">{paymentLabels[order.paymentStatus]}</p>
            </section>
            <p className="px-2 text-center text-xs text-text-secondary">კითხვების შემთხვევაში დაუკავშირდით მაღაზიას.</p>
            <footer className="pt-2 text-center text-xs text-text-secondary">შექმნილია MARTEO-ს დახმარებით</footer>
        </div>
    </main>;
}
