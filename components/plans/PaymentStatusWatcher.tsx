"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 3_000;
const MAX_CHECKS = 40;

// ბანკიდან დაბრუნებისას გადახდა ჯერ "მუშავდება": რამდენიმე წამში ერთხელ ვამოწმებთ და საბოლოო პასუხზე
// გვერდს ვაახლებთ, რომ მომხმარებელს ხელით განახლება არ დასჭირდეს. ~2 წუთის შემდეგ cron აგრძელებს.
export default function PaymentStatusWatcher({ paymentId }: { paymentId: string }) {
    const router = useRouter();
    useEffect(() => {
        let stopped = false;
        let checks = 0;
        let timer: ReturnType<typeof setTimeout>;
        const check = async () => {
            checks++;
            try {
                const response = await fetch("/api/billing/payment-status", {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: paymentId }), cache: "no-store",
                });
                const body = await response.json().catch(() => null) as { status?: string } | null;
                if (stopped) return;
                if (body?.status && body.status !== "PENDING") { router.refresh(); return; }
                // 404/422: ამ გადახდას ამ გვერდიდან ვერ ვამოწმებთ.
                if (response.status === 404 || response.status === 422 || response.status === 401 || response.status === 403) return;
            } catch { /* ქსელის შეფერხება: შემდეგ ცდაზე. */ }
            if (!stopped && checks < MAX_CHECKS) timer = setTimeout(check, INTERVAL_MS);
        };
        timer = setTimeout(check, INTERVAL_MS);
        return () => { stopped = true; clearTimeout(timer); };
    }, [paymentId, router]);
    return null;
}
