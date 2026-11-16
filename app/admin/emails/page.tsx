import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { getEmailLog, parseEmailFilters } from "@/lib/admin/email-log";
import { EMAIL_KIND_LABELS, EMAIL_STATUS } from "@/lib/admin/email-labels";
import { ADMIN_PAGE_SIZE, parseAdminPage } from "@/lib/admin/lists";
import { formatSupportCount } from "@/lib/support/support-config";
import AdminFilters from "@/components/admin/AdminFilters";
import AdminPagination from "@/components/admin/AdminPagination";
import EmailLogList from "@/components/admin/EmailLogList";
import { BackLink } from "@/components/admin/AdminDetail";

export const metadata = { title: "ელფოსტის ჟურნალი · ადმინ პანელი" };

export default async function AdminEmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const page = parseAdminPage(params.page);
    const filters = parseEmailFilters(params);
    const { total, rows, stats } = await getEmailLog(page, filters).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });

    return <div className="mx-auto max-w-4xl">
        <BackLink href="/admin/system" label="სისტემა" />
        <h1 className="mt-3 text-2xl font-semibold text-text-primary">ელფოსტის ჟურნალი</h1>
        <p className="mt-1 text-sm text-text-secondary">
            ბოლო 24 საათი: {formatSupportCount(stats.sent)} გაიგზავნა · <span className={stats.failed ? "text-danger" : ""}>{formatSupportCount(stats.failed)} ვერ გაიგზავნა</span> · {formatSupportCount(stats.limited)} ლიმიტით შეჩერდა.
            ინახება მხოლოდ ტიპი, მიმღები და სტატუსი (არა კოდი ან ტექსტი), 90 დღე.
        </p>
        <AdminFilters placeholder="ელფოსტა" values={filters} selects={[
            { name: "status", label: "ყველა სტატუსი", options: Object.entries(EMAIL_STATUS).map(([value, item]) => ({ value, label: item.label })) },
            { name: "kind", label: "ყველა ტიპი", options: Object.entries(EMAIL_KIND_LABELS).map(([value, label]) => ({ value, label })) },
        ]} />
        <p className="mt-3 text-sm text-text-secondary">{formatSupportCount(total)} წერილი · ახლიდან ძველისკენ</p>
        <section className="mt-2 rounded-2xl border border-border bg-surface px-4 py-1">
            <EmailLogList rows={rows} showRecipient empty="წერილები ვერ მოიძებნა." />
        </section>
        <AdminPagination basePath="/admin/emails" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} query={filters} />
        <p className="mt-3 text-xs leading-5 text-text-secondary">„გაიგზავნა“ ნიშნავს, რომ საფოსტო სერვისმა (Resend) წერილი მიიღო. თუ მომხმარებელი მაინც ვერ პოულობს, სთხოვეთ სპამის საქაღალდის შემოწმება.</p>
    </div>;
}
