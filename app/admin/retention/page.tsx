import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";
import { listRetention, RETENTION_LIST_DAYS, RETENTION_MONTHS, RETENTION_WARNING_DAYS, type RetentionBusiness } from "@/lib/admin/retention";
import { createPrismaClient } from "@/lib/prisma";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import DeleteBusinessButton from "@/components/admin/DeleteBusinessButton";

export const metadata = { title: "წასაშლელი ბიზნესები · ადმინ პანელი" };
export const dynamic = "force-dynamic";

function Row({ business }: { business: RetentionBusiness }) {
    const { due, daysLeft: days, monthsUnpaid: months } = business;
    return <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
            <Link href={`/admin/businesses/${business.id}`} prefetch={false} className="break-words font-medium text-text-primary hover:text-accent">{business.name}</Link>
            <p className="mt-0.5 break-all text-xs text-text-secondary">{business.owners || "მფლობელი არ ჰყავს"}</p>
            <p className="mt-1 text-xs text-text-secondary">
                გადაუხდელია {formatSupportDate(business.lockedSince.toISOString())}-დან ({months} თვე) · {business.plan} · {formatSupportCount(business.orders)} შეკვეთა · {formatSupportCount(business.customers)} მომხმარებელი
            </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
            <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${due ? "bg-danger/12 text-danger" : days <= 30 ? "bg-warning/15 text-warning" : "bg-background text-text-secondary"}`}>
                {due ? `ვადა გავიდა ${formatSupportDate(business.deleteAt.toISOString())}` : `წაიშლება ${days} დღეში`}
            </span>
            {due && <DeleteBusinessButton businessId={business.id} name={business.name} />}
        </div>
    </li>;
}

// 12 თვე გადაუხდელი ბიზნესები: წაშლა მხოლოდ აქედან, ხელით. მფლობელები 30 და 7 დღით ადრე გაფრთხილებას იღებენ.
export default async function AdminRetentionPage() {
    if (!await getAdminUser()) notFound();
    const prisma = createPrismaClient();
    const rows = await listRetention(prisma).finally(() => prisma.$disconnect());
    const due = rows.filter(row => row.due);
    const soon = rows.filter(row => !row.due);

    return <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold text-text-primary">წასაშლელი ბიზნესები</h1>
        <p className="mt-1 text-sm text-text-secondary">
            გადაუხდელი ბიზნესის მონაცემები {RETENTION_MONTHS} თვე ინახება. მფლობელები {RETENTION_WARNING_DAYS.join(" და ")} დღით ადრე იღებენ გაფრთხილებას აპში, მეილით და პუშით.
            წაშლა ავტომატური არ არის: ვადის გასვლის შემდეგ აქედან წაშლი ხელით.
        </p>

        <section aria-labelledby="retention-due" className="mt-6 rounded-3xl border border-danger/30 bg-surface p-5">
            <h2 id="retention-due" className="flex items-center gap-2 font-semibold text-text-primary">
                <Icon icon="solar:trash-bin-trash-bold-duotone" className="h-5 w-5 text-danger" aria-hidden="true" />წაშლის დრო დადგა
                <span className="rounded-full bg-danger/12 px-2 py-0.5 text-xs text-danger">{formatSupportCount(due.length)}</span>
            </h2>
            {due.length ? <ul className="mt-2 divide-y divide-border">{due.map(row => <Row key={row.id} business={row} />)}</ul>
                : <p className="mt-3 text-sm text-text-secondary">ახლა წასაშლელი ბიზნესი არ არის.</p>}
        </section>

        <section aria-labelledby="retention-soon" className="mt-4 rounded-3xl border border-border bg-surface p-5">
            <h2 id="retention-soon" className="flex items-center gap-2 font-semibold text-text-primary">
                <Icon icon="solar:hourglass-bold-duotone" className="h-5 w-5 text-warning" aria-hidden="true" />წაიშლება მომდევნო {RETENTION_LIST_DAYS} დღეში
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{formatSupportCount(soon.length)}</span>
            </h2>
            {soon.length ? <ul className="mt-2 divide-y divide-border">{soon.map(row => <Row key={row.id} business={row} />)}</ul>
                : <p className="mt-3 text-sm text-text-secondary">მომდევნო {RETENTION_LIST_DAYS} დღეში წასაშლელი არაფერია.</p>}
        </section>
    </div>;
}
