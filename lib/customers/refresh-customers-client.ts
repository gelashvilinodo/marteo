"use client";
export const CUSTOMERS_CHANGED = "marteo:customers-changed";
export function refreshCustomersAfterMutation(refreshRoute: () => void) {
    if (window.dispatchEvent(new Event(CUSTOMERS_CHANGED, { cancelable: true }))) refreshRoute();
}
