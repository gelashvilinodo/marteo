import { SkeletonPage, SkeletonText as Text } from "@/components/plans/LoadingSkeleton";
import { REFUND_WINDOW_DAYS } from "@/lib/subscription/plans";

export default function Loading() {
    return <SkeletonPage>
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <span className="size-11 shrink-0 rounded-full bg-text-secondary/10" />
            <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold sm:text-2xl">პაკეტი და გადახდები</h1><p className="mt-1 text-sm"><Text>ბიზნესი: გეგმა, გამოყენება და გადახდების ისტორია</Text></p></div>
            <div className="inline-flex min-h-10 w-full items-center gap-1.5 text-sm font-medium sm:w-auto"><Text>ფასების გვერდი</Text><span className="h-4 w-4 rounded bg-text-secondary/10" /></div>
        </section>
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm"><Text>მიმდინარე გეგმა</Text></p><h2 className="mt-1 text-xl font-semibold"><Text>მიმდინარე გეგმა</Text></h2></div><span className="rounded-lg bg-text-secondary/10 px-2.5 py-1 text-xs"><Text>აქტიური</Text></span></div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">{["ყოველთვიური ფასი", "შემდეგი გადახდა"].map(label => <div key={label} className="rounded-xl bg-background p-4"><dt className="text-xs"><Text>{label}</Text></dt><dd className="mt-1 text-lg font-semibold"><Text>00.00.00</Text></dd></div>)}</dl>
                <div className="mt-5 flex flex-wrap items-start gap-2"><div className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-text-secondary/10 px-4 text-sm font-semibold"><span className="h-4 w-4" /><Text>გეგმის შეცვლა</Text></div></div>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="flex items-center gap-2 font-semibold"><span className="h-5 w-5 rounded bg-text-secondary/10" /><Text>გადახდის მეთოდი</Text></h2>
                <p className="mt-3 text-sm leading-6"><Text>ბარათი ჯერ მიბმული არ არის. ის გეგმის პირველი გადახდისას მიებმება და ყოველთვიური გადახდა ავტომატურად შესრულდება.</Text></p>
                <ul className="mt-4 flex flex-wrap gap-2 text-xs font-medium">{["Visa", "Mastercard", "Apple Pay", "Google Pay"].map(method => <li key={method} className="rounded-lg border border-border px-2.5 py-1"><Text>{method}</Text></li>)}</ul>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5"><span className="mt-0.5 h-4 w-4 shrink-0 rounded bg-text-secondary/10" /><span><Text>ბარათის მონაცემებს ბანკი ინახავს. მართეო მათ ვერ ხედავს.</Text></span></p>
            </section>
        </div>
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold"><span className="h-5 w-5 rounded bg-text-secondary/10" /><Text>გამოყენება ამ პერიოდში</Text></h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{["შეკვეთები", "მართეო AI კითხვები", "შესყიდვა ფაილიდან", "თანამფლობელები", "თანამშრომლები"].map(label => <div key={label} className="rounded-xl bg-background p-4">
                <p className="flex items-center gap-2 text-sm"><span className="h-5 w-5 shrink-0 rounded bg-text-secondary/10" /><Text>{label}</Text></p><p className="mt-2 text-lg font-semibold"><Text>0 / 000</Text></p><div className="mt-3 h-2 rounded-full bg-text-secondary/10" /><p className="mt-2 text-xs"><Text>დარჩა 000</Text></p>
            </div>)}</div>
            <p className="mt-3 text-xs"><Text>პერიოდი: 00.00.0000 — 00.00.0000. შეკვეთების და AI-ის ლიმიტი ახალ პერიოდში თავიდან იწყება.</Text></p>
        </section>
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold"><span className="h-5 w-5 rounded bg-text-secondary/10" /><Text>გადახდების ისტორია</Text></h2>
            <div className="mt-4 rounded-xl bg-background p-4 text-sm"><Text>გადახდა ჯერ არ ყოფილა. პირველი გადახდის შემდეგ აქ გამოჩნდება თარიღი, თანხა და პერიოდი.</Text></div>
        </section>
        <section className="grid gap-3 text-sm sm:grid-cols-2">{[
            `ბიზნესის პირველი შეძენიდან ${REFUND_WINDOW_DAYS} დღის განმავლობაში თანხის დაბრუნება შეგიძლიათ მოითხოვოთ დახმარების ჩატში.`,
            "გაუქმების შემდეგ თანხა აღარ ჩამოიჭრება, გეგმა კი გადახდილი თვის ბოლომდე მოქმედებს. მონაცემები შენახული რჩება.",
        ].map(text => <p key={text} className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-4 leading-6"><span className="mt-0.5 h-5 w-5 shrink-0 rounded bg-text-secondary/10" /><span><Text>{text}</Text></span></p>)}</section>
    </SkeletonPage>;
}
