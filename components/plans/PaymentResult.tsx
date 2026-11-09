import Link from "next/link";
import { Icon } from "@/components/shared/Icon";

import { PLAN_ADJECTIVES, isPaidTier } from "@/lib/subscription/plans";

// ბანკის გვერდიდან დაბრუნების შემდეგ: გადახდის შედეგი პაკეტის გვერდის თავში.
export default function PaymentResult({ status, plan, amount }: { status: string; plan: string; amount: string }) {
    const name = isPaidTier(plan) ? `${PLAN_ADJECTIVES[plan]} გეგმა` : "გეგმა";
    if (status === "COMPLETED") return (
        <p role="status" className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm leading-6 text-text-primary">
            <Icon icon="solar:check-circle-bold-duotone" className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
            <span><b className="font-semibold">გადახდა შესრულდა ({amount} ₾).</b> {name} ჩაირთო. მადლობა, რომ MARTEO-ს ირჩევთ!</span>
        </p>
    );
    if (status === "REJECTED") return (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm leading-6 text-text-primary">
            <Icon icon="solar:danger-circle-bold-duotone" className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden="true" />
            <span className="min-w-0 flex-1"><b className="font-semibold">გადახდა ვერ შესრულდა.</b> თანხა არ ჩამოჭრილა. შეამოწმეთ ბარათის ნაშთი ან სცადეთ სხვა ბარათი.</span>
            {isPaidTier(plan) && <Link href={`/dashboard/plans/checkout?plan=${plan.toLowerCase()}`} className="inline-flex min-h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">ხელახლა ცდა</Link>}
        </div>
    );
    return (
        <p role="status" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-text-primary">
            <Icon icon="solar:clock-circle-bold-duotone" className="mt-0.5 h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
            <span><b className="font-semibold">გადახდა მუშავდება.</b> ბანკის დადასტურების შემდეგ გეგმა ავტომატურად ჩაირთვება. რამდენიმე წუთში განაახლეთ გვერდი.</span>
        </p>
    );
}
