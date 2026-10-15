"use client";
export const ANALYTICS_CHANGED = "marteo:analytics-changed";
export function refreshAnalyticsAfterMutation(refreshRoute: () => void) {
    if (window.dispatchEvent(new Event(ANALYTICS_CHANGED, { cancelable: true }))) refreshRoute();
}
