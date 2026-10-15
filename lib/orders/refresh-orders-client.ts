"use client";

export const ORDERS_CHANGED = "marteo:orders-changed";

/** The mounted list handles this; other routes retain their existing refresh. */
export function refreshOrdersAfterMutation(refreshRoute: () => void) {
    const event = new Event(ORDERS_CHANGED, { cancelable: true });
    if (window.dispatchEvent(event)) refreshRoute();
}
