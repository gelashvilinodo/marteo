import { notFound } from "next/navigation";
import { AdminAccessError, getAdminOverview } from "@/lib/admin/overview";

export default async function AdminPage() {
    const data = await getAdminOverview().catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const cards = [
        ["ბიზნესები სულ", data.totalBusinesses],
        ["მომხმარებლები სულ", data.users],
        ["შეკვეთები სულ", data.orders],
        ["დაბეჭდილი ინვოისები სულ", data.invoices],
        ["მარაგის მოძრაობები სულ", data.movements],
        ["დღეს დამატებული ბიზნესები", data.newBusinessesToday],
    ] as const;
    return <>
        <h1 className="text-2xl font-semibold text-text-primary">მიმოხილვა</h1>
        <p className="mt-2 text-sm text-text-secondary">{data.date} · თბილისის დროით</p>
        <p className="mt-1 text-sm text-text-secondary">მთელი პლატფორმის საერთო მონაცემები</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value]) => <section key={label} className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-sm text-text-secondary">{label}</h2>
                <p className="mt-3 text-3xl font-semibold text-text-primary">{value.toLocaleString("ka-GE")}</p>
            </section>)}
        </div>
        <p className="mt-5 max-w-2xl text-xs leading-6 text-text-secondary">შეკვეთებში წაშლილი ჩანაწერები არ ითვლება. დაბეჭდილი ინვოისები ითვლის შეკვეთებს, რომლებსაც აღრიცხული ბეჭდვა აქვთ; განმეორებითი ბეჭდვების რაოდენობა ბაზაში ცალკე არ ინახება.</p>
        <p className="mt-2 text-xs text-text-secondary">განახლებულია: {new Intl.DateTimeFormat("ka-GE", { timeZone: "Asia/Tbilisi", hour: "2-digit", minute: "2-digit" }).format(new Date(data.updatedAt))} · მონაცემების გასაახლებლად განაახლე გვერდი.</p>
    </>;
}
