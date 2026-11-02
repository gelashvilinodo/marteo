"use client";

import { useEffect, useState } from "react";
import { PURCHASE_PLAN_CHANGED } from "@/lib/purchases/purchase-plan-client";

// შესაძენ სიაში მყოფი პროდუქტების რაოდენობა მენიუსთვის.
export default function usePurchasePlanCount(enabled: boolean) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!enabled) return;

        let active = true;
        let controller: AbortController | null = null;

        function refresh() {
            controller?.abort();
            const current = new AbortController();
            controller = current;

            fetch("/api/purchase-plan?count=1", { cache: "no-store", credentials: "same-origin", signal: current.signal })
                .then((response) => response.ok ? response.json() as Promise<{ count?: number }> : null)
                .then((body) => {
                    if (active && typeof body?.count === "number") setCount(body.count);
                })
                .catch(() => undefined);
        }

        refresh();
        window.addEventListener(PURCHASE_PLAN_CHANGED, refresh);
        return () => {
            active = false;
            controller?.abort();
            window.removeEventListener(PURCHASE_PLAN_CHANGED, refresh);
        };
    }, [enabled]);

    return enabled ? count : 0;
}
