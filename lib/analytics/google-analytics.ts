// Google Analytics-ის Measurement ID (G-XXXXXXXXXX). სანამ ცარიელია, ანალიტიკა არ ჩაირთვება.
export const GA_MEASUREMENT_ID = "G-0JB198KLHP";

const SCRIPT_ID = "marteo-google-analytics";

// ანალიტიკა მხოლოდ რეალურ საიტზე ითვლის — localhost-ისა და სატესტო მისამართების ვიზიტები სტატისტიკას არ აფუჭებს.
function isProductionHost() {
    const host = location.hostname;
    return host === "marteo.ge" || host.endsWith(".marteo.ge");
}

type GtagWindow = {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [disableFlag: string]: unknown;
};

// gtag-ის ჩამტვირთავი ჩვენს ბანდლშია და არა inline სკრიპტში — CSP inline კოდს არ უშვებს.
export function enableGoogleAnalytics() {
    if (!GA_MEASUREMENT_ID || !isProductionHost()) return;

    const w = window as unknown as GtagWindow;
    w[`ga-disable-${GA_MEASUREMENT_ID}`] = false;

    if (document.getElementById(SCRIPT_ID)) return;

    w.dataLayer = w.dataLayer ?? [];
    w.gtag = function gtag() {
        // gtag.js arguments ობიექტს ელოდება და არა მასივს.
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
    };
    w.gtag("js", new Date());
    w.gtag("config", GA_MEASUREMENT_ID);

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
}

// თანხმობის გაუქმებისას ანალიტიკა ჩერდება და მისი ქუქები იშლება.
export function disableGoogleAnalytics() {
    if (!GA_MEASUREMENT_ID) return;

    (window as unknown as GtagWindow)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

    const domain = location.hostname.split(".").slice(-2).join(".");
    for (const cookie of document.cookie.split(";")) {
        const name = cookie.split("=")[0].trim();
        if (!name.startsWith("_ga")) continue;
        document.cookie = `${name}=; Max-Age=0; path=/`;
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}`;
    }
}
