import { requirePageAccess } from "@/lib/business/access";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import InvoiceBatchPrintPage from "@/components/dashboard/orders/InvoiceBatchPrintPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "ინვოისების ბეჭდვა", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const VIEW_KEYS = ["status", "payment", "q", "period", "from", "to"] as const;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    if (!await getCurrentUser()) redirect("/login");
    await requirePageAccess("ORDERS");
    const params = await searchParams;
    if (params.mode === "new" || params.mode === "pending") {
        // scope=view: შეკვეთების გვერდის მიმდინარე ფილტრი; მის გარეშე — მთელი ბიზნესის რიგი.
        const view = new URLSearchParams();
        if (params.scope === "view") {
            view.set("scope", "view");
            for (const key of VIEW_KEYS) if (typeof params[key] === "string") view.set(key, params[key]);
        }
        return <InvoiceBatchPrintPage mode={params.mode} view={view.toString()} />;
    }
    if (typeof params.selection === "string" && params.selection) return <InvoiceBatchPrintPage selectionKey={params.selection} />;
    const raw = typeof params.ids === "string" ? params.ids : "";
    const ids = [...new Set(raw.split(",").filter(id => /^[a-zA-Z0-9_-]+$/.test(id)))];
    if (!ids.length) return <main className="p-6">მონიშნეთ შეკვეთები და გახსენით ბეჭდვა. <a href="/dashboard/orders">შეკვეთებზე დაბრუნება</a></main>;
    return <InvoiceBatchPrintPage key={ids.join(",")} ids={ids} />;
}
