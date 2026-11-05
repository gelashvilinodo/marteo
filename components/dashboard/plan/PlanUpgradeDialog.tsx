"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import PlanCards, { planButtonClass } from "@/components/plans/PlanCards";
import { PLAN_FINE_PRINT } from "@/lib/subscription/plan-catalog";
import type { PlanState } from "@/lib/subscription/plan-state";
import { FEATURE_MIN_TIER, PLAN_ADJECTIVES, type PlanFeature } from "@/lib/subscription/plans";
import PlanCrown from "./PlanCrown";
import type { UpgradeRequest } from "./PlanContext";

export const FEATURE_LABELS: Record<PlanFeature, string> = {
    stock: "შესყიდვები და მარაგი",
    orderPhotos: "ფოტო შეკვეთაში",
    reports: "ბიზნესის ანგარიში და მარაგის უწყისი",
    fileImport: "ფაილიდან იმპორტი",
    ai: "მართეო AI",
    aiFiles: "შესყიდვა ფაილიდან AI-ით",
    sms: "SMS მომხმარებელთან",
    team: "გუნდი",
    extraBusiness: "ახალი ბიზნესი",
    hybridMode: "იმპორტი და წარმოება ერთად",
};

const LOCK_TITLES: Record<string, string> = {
    NO_PLAN: "აირჩიეთ გეგმა",
    TRIAL_ENDED: "საცდელი პერიოდი დასრულდა",
    PAYMENT_FAILED: "გადახდა ვერ შესრულდა",
    EXPIRED: "გეგმის ვადა ამოიწურა",
    CANCELED: "გეგმა გაუქმებულია",
};

function texts(request: UpgradeRequest, plan: PlanState) {
    if (request.title && !plan.locked) return { title: request.title, text: request.message ?? "" };
    if (request.feature && !plan.locked) {
        const tier = request.tier ?? FEATURE_MIN_TIER[request.feature];
        return {
            title: FEATURE_LABELS[request.feature],
            text: request.message ?? (tier === "PRO" ? "ეს ფუნქცია მხოლოდ PRO გეგმაშია." : `ეს ფუნქცია ხელმისაწვდომია ${PLAN_ADJECTIVES[tier]} გეგმიდან.`),
        };
    }
    return {
        title: LOCK_TITLES[plan.lockReason ?? "NO_PLAN"],
        text: "თქვენი მონაცემები შენახულია და მათი ნახვა ახლაც შეგიძლიათ. დამატებისა და ცვლილებისთვის აირჩიეთ გეგმა.",
    };
}

// Native <dialog>: ფოკუსი, Escape და ფონზე დაჭერით დახურვა ბრაუზერიდან მოდის.
export default function PlanUpgradeDialog({ request, plan, isOwner, onClose }: {
    request: UpgradeRequest | null;
    plan: PlanState;
    isOwner: boolean;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (request && !dialog.open) dialog.showModal();
        if (!request && dialog.open) dialog.close();
    }, [request]);

    const content = request ? texts(request, plan) : null;
    const focus = plan.locked || !request ? null : request.tier ?? (request.feature ? FEATURE_MIN_TIER[request.feature] : null);

    return <dialog ref={ref} onClose={onClose} aria-labelledby="plan-dialog-title"
        className={`m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background p-0 text-text-primary shadow-2xl backdrop:bg-[var(--marteo-overlay)] backdrop:backdrop-blur-sm ${isOwner ? "w-[min(1040px,calc(100vw-2rem))]" : "w-[min(420px,calc(100vw-2rem))]"}`}>
        {content && <div className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface">
                    <PlanCrown feature={request?.feature} pro={focus === "PRO" ? true : undefined} className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 id="plan-dialog-title" className="text-lg font-semibold">{content.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                        {isOwner ? content.text : "ეს ფუნქცია ამ ბიზნესში ხელმისაწვდომი არ არის. მიმართეთ ბიზნესის მფლობელს."}
                    </p>
                </div>
                <button type="button" onClick={() => ref.current?.close()} aria-label="ფანჯრის დახურვა"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface hover:text-text-primary">
                    <Icon icon="solar:close-circle-linear" className="h-6 w-6" aria-hidden="true" />
                </button>
            </div>
            {isOwner && <>
                <div className="mt-5">
                    <PlanCards compact current={plan.locked ? null : plan.tier === "TRIAL" ? null : plan.tier} focus={focus}
                        action={card => <Link href={`/dashboard/plans?plan=${card.tier.toLowerCase()}`} onClick={() => ref.current?.close()}
                            className={planButtonClass(card.tier, (focus ?? "PRO") === card.tier)}>
                            დეტალურად<Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                        </Link>} />
                </div>
                <p className="mt-4 text-center text-xs text-text-secondary">{PLAN_FINE_PRINT}</p>
            </>}
            {!isOwner && <button type="button" onClick={() => ref.current?.close()}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover">გასაგებია</button>}
        </div>}
    </dialog>;
}
