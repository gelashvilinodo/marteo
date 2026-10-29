import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { listCampaigns } from "@/lib/notifications/admin";
import { describeAudience } from "@/lib/notifications/audience-options";
import { CancelCampaignButton } from "@/components/admin/notifications/CampaignForm";
import PushCard from "@/components/support/PushCard";
import { getVapidPublicKey } from "@/lib/push/web-push";

const timeFormat = new Intl.DateTimeFormat("ka-GE", { timeZone: "Asia/Tbilisi", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AdminNotificationsPage() {
    const campaigns = await listCampaigns().catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const now = new Date();
    return <>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">შეტყობინებები</h1>
                <p className="mt-2 text-sm text-text-secondary">მომხმარებლებისთვის შიდა შეტყობინებების გაგზავნა და დაგეგმვა</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Link href="/admin/notifications/welcome" prefetch={false} className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary hover:bg-background">მისალმების ტექსტი</Link>
                <Link href="/admin/notifications/new" prefetch={false} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">ახალი შეტყობინება</Link>
            </div>
        </div>

        <PushCard publicKey={getVapidPublicKey()} description="ამ მოწყობილობაზე მოგივა ყოველი ახალი შეტყობინება დახმარების ჩათში და ყოველი ახალი მომხმარებლის რეგისტრაცია, ცალ-ცალკე, მაშინაც, თუ MARTEO დახურულია." />

        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm text-text-secondary">
            <h2 className="font-semibold text-text-primary">ავტომატური შეტყობინებები</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>მისალმება: ყველა ახალ მომხმარებელს, ტექსტი იცვლება „მისალმების ტექსტიდან“.</li>
                <li>დაბალი მარაგი (5 ცალზე ნაკლები) და ამოწურული პროდუქტი: ბიზნესის ყველა წევრს.</li>
                <li>საცდელი პერიოდის დასრულება და პაკეტის განახლება: ვადის ამოწურვამდე 3 დღით ადრე.</li>
                <li>გადახდის დადასტურება: გადახდების ჩართვისთანავე.</li>
            </ul>
        </section>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-border text-xs text-text-secondary">
                    <tr>{["სათაური", "ვის", "გაგზავნის დრო", "სტატუსი", "მიიღო / წაიკითხა", ""].map((h, i) => <th key={i} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border text-text-primary">
                    {campaigns.map(c => {
                        const pending = !c.canceledAt && c.deliverAt > now;
                        const status = c.canceledAt ? ["გაუქმებული", "bg-danger/10 text-danger"] : pending ? ["დაგეგმილი", "bg-warning/10 text-warning"] : ["გაგზავნილი", "bg-success/10 text-success"];
                        return <tr key={c.id}>
                            <td className="max-w-[240px] px-4 py-3"><p className="truncate font-medium" title={c.title}>{c.title}</p><p className="truncate text-xs text-text-secondary" title={c.body}>{c.body}</p></td>
                            <td className="max-w-[240px] px-4 py-3 text-xs text-text-secondary">{describeAudience({ modes: c.modes, plan: c.plan, registeredWithinDays: c.registeredWithinDays })}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{timeFormat.format(c.deliverAt)}</td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status[1]}`}>{status[0]}</span></td>
                            <td className="px-4 py-3">{c.delivered.toLocaleString("ka-GE")} / {c.read.toLocaleString("ka-GE")}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">{pending && <span className="flex justify-end gap-4">
                                <Link href={`/admin/notifications/${c.id}`} prefetch={false} className="text-sm text-accent hover:underline">რედაქტირება</Link>
                                <CancelCampaignButton id={c.id} />
                            </span>}</td>
                        </tr>;
                    })}
                    {campaigns.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-text-secondary">ჯერ არცერთი შეტყობინება არ გაგიგზავნია.</td></tr>}
                </tbody>
            </table>
        </div>
        <p className="mt-3 text-xs text-text-secondary">„მიიღო“ ითვლის მომხმარებლებს, რომლებმაც გაგზავნის შემდეგ სისტემაში შესვლისას მიიღეს შეტყობინება.</p>
    </>;
}
