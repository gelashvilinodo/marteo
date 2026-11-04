import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { parseAdminPage } from "@/lib/admin/lists";
import { ERRORS_PAGE_SIZE, getSystemOverview, type SystemJobView } from "@/lib/admin/system";
import { formatSupportCount, formatSupportDate, formatSupportTime } from "@/lib/support/support-config";
import AdminPagination from "@/components/admin/AdminPagination";
import { Panel } from "@/components/admin/AdminDetail";
import { BannerManager, ResolveAllButton, ResolveErrorButton } from "@/components/admin/SystemActions";

export const metadata = { title: "სისტემა · ადმინ პანელი" };

const JOB_STATES: Record<SystemJobView["state"], { label: string; icon: string; tone: string }> = {
    ok: { label: "მუშაობს", icon: "solar:check-circle-bold", tone: "text-success" },
    failed: { label: "ბოლო გაშვება ჩავარდა", icon: "solar:danger-circle-bold", tone: "text-danger" },
    late: { label: "2 საათზე მეტია არ გაშვებულა", icon: "solar:clock-circle-bold", tone: "text-warning" },
    never: { label: "ჯერ არ გაშვებულა", icon: "solar:question-circle-bold", tone: "text-text-secondary" },
};
const SOURCE_LABELS: Record<string, string> = { server: "სერვერი", request: "გვერდი/როუტი", cron: "cron" };

const when = (date: Date) => `${formatSupportDate(date.toISOString())}, ${formatSupportTime(date.toISOString())}`;

export default async function AdminSystemPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const view = params.view === "resolved" ? "resolved" : "open";
    const page = parseAdminPage(params.page);
    const data = await getSystemOverview(view, page).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const total = view === "open" ? data.counts.open : data.counts.resolved;

    return <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">სისტემა</h1>
                <p className="mt-1 text-sm text-text-secondary">შეცდომები, საათობრივი სამუშაოები და ბანერი.</p>
            </div>
            <Link href="/admin/audit" prefetch={false} className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text-primary transition hover:border-accent/40">
                <Icon icon="solar:history-linear" className="h-5 w-5 text-accent" aria-hidden="true" /> ადმინის ქმედებების ისტორია
            </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {data.jobs.map(job => {
                const state = JOB_STATES[job.state];
                return <section key={job.name} className="rounded-2xl border border-border bg-surface p-4">
                    <p className={`flex items-center gap-1.5 text-xs font-medium ${state.tone}`}><Icon icon={state.icon} className="h-4 w-4" aria-hidden="true" />{state.label}</p>
                    <h2 className="mt-2 text-sm font-semibold text-text-primary">{job.label}</h2>
                    <p className="mt-1 text-xs text-text-secondary">{job.lastStartedAt ? `ბოლოს: ${when(job.lastStartedAt)}` : "გაეშვება deploy-ის შემდეგ, საათში ერთხელ."}</p>
                    {job.lastStartedAt && <p className="text-xs text-text-secondary">
                        {job.lastResult !== null ? `შედეგი: ${formatSupportCount(job.lastResult)} ჩანაწერი · ` : ""}{formatSupportCount(job.runs)} გაშვება{job.failures ? ` · ${job.failures} ჩავარდა` : ""}
                    </p>}
                    {job.state === "failed" && job.lastError && <p className="mt-1 text-xs text-danger">{job.lastError}</p>}
                </section>;
            })}
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
                <div>
                    <h2 className="text-sm font-semibold text-text-primary">შეცდომები</h2>
                    <p className="text-xs text-text-secondary">{formatSupportCount(data.counts.open)} ღია · ბოლო 24 საათში {formatSupportCount(data.counts.day)}</p>
                </div>
                <div className="flex items-center gap-2">
                    <nav aria-label="შეცდომების ფილტრი" className="flex gap-1 rounded-xl bg-background p-1">
                        {[{ value: "open", label: "ღია" }, { value: "resolved", label: "მოგვარებული" }].map(item =>
                            <Link key={item.value} href={item.value === "open" ? "/admin/system" : "/admin/system?view=resolved"} prefetch={false} scroll={false}
                                aria-current={view === item.value ? "page" : undefined}
                                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${view === item.value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}>{item.label}</Link>)}
                    </nav>
                    {view === "open" && data.counts.open > 0 && <ResolveAllButton count={data.counts.open} />}
                </div>
            </div>
            {data.errors.length === 0
                ? <p className="flex items-center gap-2 px-4 py-5 text-sm text-text-secondary sm:px-5"><Icon icon="solar:check-circle-linear" className="h-5 w-5 text-success" aria-hidden="true" />{view === "open" ? "ღია შეცდომა არ არის." : "მოგვარებული შეცდომები არ არის."}</p>
                : <ul className="mt-3 divide-y divide-border">
                    {data.errors.map(error => <li key={error.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                        <span className="mt-0.5 min-w-8 rounded-lg bg-danger/12 px-1.5 py-0.5 text-center text-xs font-semibold text-danger" title="რამდენჯერ მოხდა">×{formatSupportCount(error.count)}</span>
                        <div className="min-w-0 flex-1">
                            <p className="break-words font-mono text-[13px] text-text-primary">{error.message}</p>
                            <p className="mt-0.5 text-[11px] text-text-secondary">
                                {SOURCE_LABELS[error.source] ?? error.source}{error.route ? ` · ${error.route}` : ""} · ბოლოს {when(error.lastAt)}{error.count > 1 ? ` · პირველად ${when(error.firstAt)}` : ""}
                                {error.resolvedAt ? ` · მოგვარდა ${when(error.resolvedAt)}` : ""}
                            </p>
                        </div>
                        {!error.resolvedAt && <ResolveErrorButton id={error.id} />}
                    </li>)}
                </ul>}
            <div className="px-4 pb-4 sm:px-5"><AdminPagination basePath="/admin/system" page={page} pageSize={ERRORS_PAGE_SIZE} total={total} query={view === "open" ? {} : { view }} /></div>
        </section>
        <p className="mt-2 text-xs leading-5 text-text-secondary">მხოლოდ შეცდომის ტიპი და ჩვენი კოდის ტექსტი ინახება; მომხმარებლის მონაცემები ჟურნალში არ ხვდება. ერთნაირი შეცდომები ერთად ჯგუფდება.</p>

        <div className="mt-4">
            <Panel title="ბანერი დაშბორდზე"><BannerManager banners={data.banners} /></Panel>
        </div>
    </div>;
}
