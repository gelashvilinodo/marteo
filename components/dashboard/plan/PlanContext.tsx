"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { planAllows, type PlanState } from "@/lib/subscription/plan-state";
import { PLAN_FEATURES, type PaidTier, type PlanFeature } from "@/lib/subscription/plans";
import PlanUpgradeDialog from "./PlanUpgradeDialog";

// რატომ გაიხსნა გეგმის ფანჯარა: კონკრეტული ფუნქცია ან ბიზნესი მხოლოდ ნახვის რეჟიმშია.
// tier: რომელ გეგმაზე გადასვლაა საჭირო, თუ ფუნქცია უკვე ღიაა და მისი ლიმიტია ამოწურული (მაგ. გუნდი Business-ზე).
// title: ლიმიტის ამოწურვისას (შეკვეთები, AI) ფუნქციის სახელის ნაცვლად.
export type UpgradeRequest = { feature?: PlanFeature | null; message?: string; tier?: PaidTier; title?: string };

type PlanValue = {
    plan: PlanState | null;
    isOwner: boolean;
    locked: boolean;
    allows: (feature: PlanFeature) => boolean;
    openUpgrade: (request?: UpgradeRequest) => void;
    // ქმედების წინ: true, თუ შეიძლება; თორემ გეგმის ფანჯარას ხსნის. ფუნქციის გარეშე მხოლოდ ბლოკს ამოწმებს.
    guard: (feature?: PlanFeature) => boolean;
};

// დაშბორდის გარეთ (ან კონტექსტის გარეშე) ყველაფერი ღიაა: შემოწმებას მაინც სერვერი აკეთებს.
const PlanContext = createContext<PlanValue>({
    plan: null, isOwner: true, locked: false, allows: () => true, openUpgrade: () => {}, guard: () => true,
});

export function usePlan() {
    return useContext(PlanContext);
}

// ბლოკის მოხსნამდე ფანჯარა სესიაში ერთხელ ჩნდება შესვლისას; დახურვის შემდეგ მხოლოდ დაბლოკილ ქმედებაზე.
const SEEN_KEY = "marteo-plan-lock-seen";

const isFeature = (value: string | null): value is PlanFeature => PLAN_FEATURES.includes(value as PlanFeature);

// sessionStorage-ის პატარა საცავი: სერვერზე „ნანახია“, რომ ფანჯარა მხოლოდ ბრაუზერში გაიხსნას.
const seenListeners = new Set<() => void>();
function subscribeSeen(listener: () => void) {
    seenListeners.add(listener);
    return () => { seenListeners.delete(listener); };
}
function readSeen(key: string) {
    try { return sessionStorage.getItem(key) === "1"; } catch { return false; }
}
function markSeen(key: string) {
    try { sessionStorage.setItem(key, "1"); } catch { /* private mode: it shows again next load */ }
    seenListeners.forEach(listener => listener());
}

export function PlanProvider({ plan, isOwner, businessId, children }: { plan: PlanState; isOwner: boolean; businessId: string; children: ReactNode }) {
    const [request, setRequest] = useState<UpgradeRequest | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const openUpgrade = useCallback((next: UpgradeRequest = {}) => setRequest(next), []);

    // გეგმით დაკეტილი გვერდიდან სერვერი ?upgrade=<ფუნქცია|locked>-ით აბრუნებს: ფანჯარა მისამართიდან ჩანს.
    const reason = searchParams.get("upgrade");
    const fromUrl: UpgradeRequest | null = reason ? { feature: isFeature(reason) ? reason : null } : null;

    // ვადაგასული ან გადაუხდელი გეგმა: პირველივე შესვლისას (სესიაში ერთხელ) ფანჯარა თვითონ ჩნდება.
    const seenKey = `${SEEN_KEY}:${businessId}`;
    const lockSeen = useSyncExternalStore(subscribeSeen, () => readSeen(seenKey), () => true);
    const shown = request ?? fromUrl ?? (plan.locked && !lockSeen ? {} : null);

    const close = useCallback(() => {
        setRequest(null);
        if (plan.locked) markSeen(seenKey);
        if (reason) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("upgrade");
            router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
        }
    }, [plan.locked, seenKey, reason, searchParams, router, pathname]);

    // სერვერის 402 (გეგმის უარი) ცვლილების მცდელობაზე გეგმის ფანჯარას ხსნის. ფონური წაკითხვები
    // (GET) ფანჯარას არ ხსნის, რომ გვერდის ჩატვირთვამ თავისით არ ამოაგდოს.
    useEffect(() => {
        const original = window.fetch;
        const patched: typeof window.fetch = async (input, init) => {
            const response = await original(input, init);
            const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
            if (response.status === 402 && method !== "GET") {
                response.clone().json().then((raw: unknown) => {
                    const data = raw as { code?: string; feature?: string | null; message?: string; requiredTier?: PaidTier | null } | null;
                    if (data?.code === "PLAN_LIMIT") {
                        setRequest({ title: "გეგმის ლიმიტი ამოიწურა", message: data.message, tier: data.requiredTier ?? undefined });
                    } else if (data?.code === "PLAN_LOCKED" || data?.code === "PLAN_FEATURE") {
                        setRequest({ feature: isFeature(data.feature ?? null) ? data.feature as PlanFeature : null, message: data.message });
                    }
                }).catch(() => {});
            }
            return response;
        };
        window.fetch = patched;
        return () => { if (window.fetch === patched) window.fetch = original; };
    }, []);

    const value = useMemo<PlanValue>(() => ({
        plan, isOwner, locked: plan.locked, openUpgrade,
        allows: (feature: PlanFeature) => planAllows(plan, feature),
        guard: (feature?: PlanFeature) => {
            if (plan.locked) { openUpgrade(); return false; }
            if (feature && !planAllows(plan, feature)) { openUpgrade({ feature }); return false; }
            return true;
        },
    }), [plan, isOwner, openUpgrade]);

    return <PlanContext value={value}>
        {children}
        <PlanUpgradeDialog request={shown} plan={plan} isOwner={isOwner} onClose={close} />
    </PlanContext>;
}
