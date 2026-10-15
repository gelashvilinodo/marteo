"use client";
export const PURCHASES_CHANGED = "marteo:purchases-changed";
export function refreshPurchasesAfterMutation(refreshRoute: () => void) {
    if (window.dispatchEvent(new Event(PURCHASES_CHANGED, { cancelable: true }))) refreshRoute();
}
