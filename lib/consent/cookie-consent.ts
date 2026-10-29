// ქუქის თანხმობა ბრაუზერში ინახება და 12 თვეში ერთხელ თავიდან იკითხება.
export const CONSENT_STORAGE_KEY = "marteo-cookie-consent";
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const CHANGE_EVENT = "marteo:cookie-consent-change";
const OPEN_SETTINGS_EVENT = "marteo:open-cookie-settings";

export type CookieConsent = {
    analytics: boolean;
    decidedAt: string;
    version: number;
};

export function parseConsent(raw: string | null | undefined): CookieConsent | null {
    if (!raw) return null;

    try {
        const value = JSON.parse(raw) as Partial<CookieConsent>;
        const decidedAt = Date.parse(value.decidedAt ?? "");

        if (value.version !== CONSENT_VERSION || typeof value.analytics !== "boolean" || Number.isNaN(decidedAt)) return null;
        if (Date.now() - decidedAt > CONSENT_MAX_AGE_MS) return null;

        return { analytics: value.analytics, decidedAt: value.decidedAt!, version: CONSENT_VERSION };
    } catch {
        return null;
    }
}

// useSyncExternalStore-ს სტაბილური მნიშვნელობა სჭირდება, ამიტომ ვაბრუნებთ შენახულ სტრიქონს.
// ბრაუზერი თუ შენახვას ბლოკავს, არჩევანი მიმდინარე სესიაში მეხსიერებაში რჩება.
let sessionConsent: string | null = null;

export function readConsentSnapshot() {
    try {
        return localStorage.getItem(CONSENT_STORAGE_KEY) ?? sessionConsent;
    } catch {
        return sessionConsent;
    }
}

export function readConsent() {
    return parseConsent(readConsentSnapshot());
}

export function saveConsent(analytics: boolean) {
    const consent: CookieConsent = { analytics, decidedAt: new Date().toISOString(), version: CONSENT_VERSION };

    sessionConsent = JSON.stringify(consent);

    try {
        localStorage.setItem(CONSENT_STORAGE_KEY, sessionConsent);
    } catch {
        // შენახვა ვერ მოხერხდა — არჩევანი ამ სესიაში sessionConsent-ით მოქმედებს.
    }

    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: consent }));
}

export function subscribeConsent(onChange: () => void) {
    function onStorage(event: StorageEvent) {
        if (event.key === CONSENT_STORAGE_KEY || event.key === null) onChange();
    }

    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);

    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

export function openCookieSettings() {
    window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function onOpenCookieSettings(handler: () => void) {
    window.addEventListener(OPEN_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
}
