import { SkeletonPage, SkeletonText as Text } from "@/components/plans/LoadingSkeleton";
import { REFUND_WINDOW_DAYS } from "@/lib/subscription/plans";

export default function Loading() {
    return <SkeletonPage narrow>
        <div className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium"><span className="h-4 w-4 rounded bg-text-secondary/10" /><Text>გეგმები</Text></div>
        <h1 className="text-2xl font-semibold">გადახდა</h1>
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="font-semibold"><Text>შეკვეთის შეჯამება</Text></h2>
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-background p-4">
                    <span className="h-8 w-8 shrink-0 rounded-lg bg-text-secondary/10" />
                    <div className="min-w-0"><p className="font-semibold"><Text>ბიზნესი გეგმა · თვიური</Text></p><p className="text-sm"><Text>ბიზნესის სახელი</Text></p></div>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-3"><dt><Text>თვიური ფასი</Text></dt><dd><Text>00.00 ₾</Text></dd></div>
                    <div className="flex justify-between gap-3 border-t border-border pt-3 text-base font-semibold"><dt><Text>დღეს გადასახდელი</Text></dt><dd><Text>00.00 ₾</Text></dd></div>
                    <div className="flex justify-between gap-3"><dt><Text>შემდეგი გადახდა</Text></dt><dd><Text>00.00.0000</Text></dd></div>
                </dl>
                <p className="mt-3 text-xs"><Text>ფასში შედის ბანკის საკომისიო.</Text></p>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="font-semibold"><Text>გადახდის მეთოდი</Text></h2>
                <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">{["ბარათი", "Apple Pay", "Google Pay", "დაცული გადახდა"].map(label => <li key={label} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5"><span className="h-5 w-5 rounded bg-text-secondary/10" /><Text>{label}</Text></li>)}</ul>
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-background p-3 text-sm leading-6"><span className="mt-0.5 h-5 w-5 shrink-0 rounded bg-text-secondary/10" /><span><Text>ბიზნესის პირველი შეძენიდან {REFUND_WINDOW_DAYS} დღის განმავლობაში შეგიძლიათ მოითხოვოთ თანხის დაბრუნება დახმარების ჩატში.</Text></span></p>
                <div className="mt-5 space-y-4">
                    <div className="flex items-start gap-3 text-sm leading-6"><span className="mt-1 h-4 w-4 shrink-0 rounded bg-text-secondary/10" /><span><Text>ვეთანხმები მომსახურების პირობებს და ყოველთვიურ ავტომატურ გადახდას. გაუქმება ნებისმიერ დროს შემიძლია.</Text></span></div>
                    <div className="min-h-12 w-full rounded-xl bg-text-secondary/10" />
                    <p className="text-center text-xs"><Text>გადახდა საქართველოს ბანკის დაცულ გვერდზე მოხდება. ბარათის მონაცემები MARTEO-ს არ ხვდება.</Text></p>
                </div>
            </section>
        </div>
    </SkeletonPage>;
}
