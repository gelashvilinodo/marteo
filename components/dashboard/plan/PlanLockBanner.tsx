"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useState } from "react";
import { usePlan } from "./PlanContext";

const DAY = 86_400_000;

// მხოლოდ ნახვის რეჟიმის ზოლი ყველა გვერდის თავზე; საცდელში მფლობელს დარჩენილ დღეებს აჩვენებს.
export default function PlanLockBanner() {
    const { plan, isOwner, locked, openUpgrade } = usePlan();
    const [now] = useState(() => Date.now());
    if (!plan) return null;

    if (locked) {
        return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-text-primary sm:px-6 lg:px-8">
            <Icon icon="solar:eye-bold-duotone" className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <span className="min-w-0 flex-1">მხოლოდ ნახვის რეჟიმი: მონაცემები შენახულია, მაგრამ დამატება და ცვლილება დაბლოკილია.</span>
            {isOwner
                ? <button type="button" onClick={() => openUpgrade()} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent-hover">
                    <Icon icon="solar:crown-bold" className="h-4 w-4" aria-hidden="true" />აირჩიეთ გეგმა
                </button>
                : <span className="text-text-secondary">მიმართეთ ბიზნესის მფლობელს.</span>}
        </div>;
    }

    if (plan.tier === "TRIAL" && isOwner && plan.expiresAt) {
        const days = Math.max(0, Math.ceil((new Date(plan.expiresAt).getTime() - now) / DAY));
        return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-accent/20 bg-accent/5 px-4 py-2 text-sm sm:px-6 lg:px-8">
            <Icon icon="solar:gift-bold-duotone" className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-text-primary">
                საცდელი პერიოდი: {days === 0 ? "დღეს მთავრდება" : `დარჩა ${days} დღე`}. ყველა ფუნქცია ღიაა.
            </span>
            <Link href="/dashboard/plans" className="font-semibold text-accent hover:underline">გეგმების ნახვა</Link>
        </div>;
    }

    return null;
}
