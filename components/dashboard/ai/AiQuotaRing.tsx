"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { AI_MONTHLY_LIMITS, AI_QUOTA_WARN_SHARE, formatResetDay, type AiQuota } from "@/lib/ai/ai-quota";
import { PLAN_ADJECTIVES } from "@/lib/subscription/plans";

// The provider sends the fresh numbers after every answer; without detail the ring reloads them.
export const AI_QUOTA_EVENT = "marteo-ai-quota";

export function announceAiQuota(quota?: AiQuota) {
    window.dispatchEvent(new CustomEvent(AI_QUOTA_EVENT, { detail: quota }));
}

const UPGRADE_HREF = "/dashboard/plans";

// Start-ს AI არ აქვს, ამიტომ ყველა დაბალი გეგმიდან შემდეგი ნაბიჯი Business-ია.
const NEXT_PLAN: Record<string, "BUSINESS" | "PRO"> = { FREE: "BUSINESS", TRIAL: "BUSINESS", START: "BUSINESS", BUSINESS: "PRO" };

function nextPlan(plan: string) {
    const next = NEXT_PLAN[plan];
    return next ? { plan: next, limit: AI_MONTHLY_LIMITS[next] } : null;
}

async function loadQuota(): Promise<AiQuota | null> {
    const response = await fetch("/api/ai/quota", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null) as { quota?: AiQuota } | null;
    return data?.quota ?? null;
}

export default function AiQuotaRing() {
    const [quota, setQuota] = useState<AiQuota | null>(null);
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let alive = true;
        const refresh = () => void loadQuota().then(value => { if (alive && value) setQuota(value); });
        refresh();
        const onQuota = (event: Event) => {
            const detail = (event as CustomEvent<AiQuota | undefined>).detail;
            if (detail) setQuota(detail);
            else refresh();
        };
        window.addEventListener(AI_QUOTA_EVENT, onQuota);
        return () => { alive = false; window.removeEventListener(AI_QUOTA_EVENT, onQuota); };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
        // Escape closes only the popover; captured first so the panel itself stays open.
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
        document.addEventListener("pointerdown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); };
    }, [open]);

    if (!quota) return null;

    const left = Math.max(quota.limit - quota.used, 0);
    const share = quota.limit ? Math.min(quota.used / quota.limit, 1) : 1;
    const empty = quota.disabled || left === 0;
    const near = !empty && share >= AI_QUOTA_WARN_SHARE;
    const tone = empty ? "text-danger" : near ? "text-warning" : "text-accent";
    const radius = 7;
    const length = 2 * Math.PI * radius;
    const upgrade = (near || empty) && !quota.disabled ? nextPlan(quota.plan) : null;

    return (
        <div ref={box} className="relative">
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                aria-label={quota.disabled ? "მართეო AI გამორთულია" : `AI ლიმიტი: დარჩა ${left} / ${quota.limit}`}
                title={quota.disabled ? "AI გამორთულია" : `დარჩა ${left} / ${quota.limit}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/10 lg:h-8 lg:w-8"
            >
                <svg viewBox="0 0 18 18" className={`h-[18px] w-[18px] -rotate-90 ${tone}`} aria-hidden="true">
                    {/* ამოწურვისას მთელი რგოლი წითლდება, რომ ცარიელი რკალი შეუმჩნეველი არ დარჩეს. */}
                    <circle cx="9" cy="9" r={radius} fill="none" stroke={empty ? "currentColor" : "rgb(255 255 255 / 0.18)"} strokeOpacity={empty ? 0.6 : 1} strokeWidth="2.5" />
                    {/* რკალი დარჩენილ წილს აჩვენებს: იკლებს, როცა ლიმიტი იხარჯება. */}
                    <circle cx="9" cy="9" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={length} strokeDashoffset={length * share} className="transition-[stroke-dashoffset] duration-500" />
                </svg>
            </button>

            {open && (
                <div role="dialog" aria-label="AI ლიმიტი" className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl border border-border bg-surface p-3 text-left shadow-xl">
                    {quota.disabled ? (
                        <p className="text-sm text-text-primary">მართეო AI ამ ბიზნესისთვის გამორთულია. დეტალებისთვის მოგვწერე დახმარების ჩათში.</p>
                    ) : (
                        <>
                            <p className="text-sm text-text-primary">{quota.trial ? "საცდელში დარჩა" : "ამ პერიოდში დარჩა"}: <b className="font-semibold">{left}</b> / {quota.limit}</p>
                            <p className="mt-0.5 text-xs text-text-secondary">
                                {quota.trial
                                    ? "საცდელში ფაილიდან შესყიდვაც ერთ კითხვად ითვლება."
                                    : quota.resetsAt ? `განახლდება ${formatResetDay(quota.resetsAt)}.` : "კითხვების ლიმიტი."}
                            </p>
                            {!quota.files.shared && quota.files.limit !== 0 && (
                                <p className="mt-2 border-t border-border pt-2 text-xs text-text-primary">
                                    შესყიდვა ფაილიდან: <b className="font-semibold">{quota.files.limit === null ? `${quota.files.used} · ულიმიტო` : `${Math.max(quota.files.limit - quota.files.used, 0)} / ${quota.files.limit}`}</b>{quota.files.limit === null ? "" : " დარჩა"}
                                </p>
                            )}
                            {upgrade && (
                                <div className="mt-3 rounded-lg bg-accent/10 p-2.5">
                                    <p className="text-xs text-text-primary">
                                        {empty ? "ლიმიტი ამოიწურა." : "ლიმიტი იწურება."} {PLAN_ADJECTIVES[upgrade.plan]} გეგმაში თვეში {upgrade.limit} კითხვაა.
                                    </p>
                                    <Link href={UPGRADE_HREF} prefetch={false} onClick={() => setOpen(false)}
                                        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition hover:bg-accent-hover">
                                        <Icon icon="solar:crown-linear" className="h-4 w-4" aria-hidden="true" /> გეგმის ამაღლება
                                    </Link>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
