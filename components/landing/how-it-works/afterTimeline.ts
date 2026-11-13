import { weekCounts } from "./data";
import { easeInOut, timeHelpers, type BaseTimes, type CameraKey, type Chapter, type Click, type Mode, type Script, type ScrollKey } from "./engine";
import type { OrdersState } from "./Pages";

// „როგორ მუშაობს" #2: შეკვეთის დეტალები → ინვოისი → ბეჭდვა → მომხმარებლის გვერდი → გაგზავნილი → SMS.

export type AfterTimes = BaseTimes & {
    clickRowMenu: number;
    detailsOpen: number;
    clickInvoice: number;
    invoiceOpen: number;
    clickPrint: number;
    printed: number;
    clickCustomer: number;
    customerOpen: number;
    customerScrollFrom: number;
    customerScrollTo: number;
    customerClose: number;
    clickCloseInvoice: number;
    clickCloseDetails: number;
    clickStatus: number;
    clickShipped: number;
    smsPhone: number;
    smsArrive: number;
};

export type AfterScript = Script<AfterTimes>;

const T: AfterTimes = {
    clickRowMenu: 1.6,
    detailsOpen: 1.8,
    clickInvoice: 3.7,
    invoiceOpen: 3.9,
    clickPrint: 7.2,
    printed: 8.9,
    clickCustomer: 10.6,
    customerOpen: 10.9,
    customerScrollFrom: 12.4,
    customerScrollTo: 14.9,
    customerClose: 16.1,
    clickCloseInvoice: 17.2,
    clickCloseDetails: 18.1,
    clickStatus: 19.4,
    clickShipped: 20.3,
    smsPhone: 21.2,
    smsArrive: 22.0,
    end: 26.4,
    duration: 29.0,
};

export function buildAfterScript(mode: Mode): AfterScript {
    const m = mode === "mobile";

    const clicks: Click[] = [
        { t: T.clickRowMenu, target: "row-menu", move: 1.2 },
        { t: T.clickInvoice, target: "details-invoice", move: 1.0 },
        { t: T.clickPrint, target: "invoice-print", move: 1.0 },
        { t: T.clickCustomer, target: "invoice-customer", move: 1.0 },
        { t: T.clickCloseInvoice, target: "invoice-close", move: 0.9 },
        { t: T.clickCloseDetails, target: "details-close", move: 0.6 },
        { t: T.clickStatus, target: "row-status", move: 1.0 },
        { t: T.clickShipped, target: "status-shipped", move: 0.55 },
    ];

    // ტელეფონზე ეკრანი ისედაც ახლოსაა, ამიტომ ზუმი მხოლოდ დესკტოპზეა.
    const camera: CameraKey[] = m
        ? [{ t: 0, dur: 0, target: null, scale: 1 }]
        : [
              { t: 0, dur: 0, target: null, scale: 1 },
              { t: T.invoiceOpen + 0.5, dur: 0.9, target: "invoice-paper", scale: 1.4 },
              { t: T.clickPrint - 1.1, dur: 0.8, target: null, scale: 1 },
              { t: T.clickCloseDetails + 0.3, dur: 0.8, target: "order-row", scale: 1.35, anchorY: 1.2 },
              { t: T.smsPhone - 0.3, dur: 0.7, target: null, scale: 1 },
              { t: T.smsArrive + 0.3, dur: 0.9, target: "sms-card", scale: 1.35, anchorY: 0.2 },
              { t: T.end, dur: 1.0, target: null, scale: 1 },
          ];

    // ტელეფონზე შეკვეთის სტრიქონი ეკრანის ქვემოთაა, ამიტომ გვერდი თავიდანვე ჩამოსქროლილია.
    const scroll: ScrollKey[] = m ? [{ t: 0, dur: 0, target: "order-row", offset: 330 }] : [{ t: 0, dur: 0, target: null }];

    const chapters: Chapter[] = [
        { id: "details", label: "დეტალები", from: 0, caption: "სამ წერტილზე დაჭერით შეკვეთის ყველა დეტალი ერთ ფანჯარაში იხსნება." },
        { id: "invoice", label: "ინვოისი", from: T.clickInvoice - 0.6, caption: "ინვოისი შეკვეთის მონაცემებით თავისით მზადდება — QR კოდითაც." },
        { id: "print", label: "ბეჭდვა", from: T.clickPrint - 0.9, caption: "ერთი დაჭერით ბეჭდავთ ან PDF-ად ინახავთ." },
        { id: "customer", label: "მომხმარებლის გვერდი", from: T.clickCustomer - 0.8, caption: "მომხმარებელი პირად ბმულზე ხედავს სტატუსს, პროდუქტებს და თანხას." },
        { id: "status", label: "გაგზავნა", from: T.clickCloseInvoice - 0.4, caption: "შეკვეთას „გაგზავნილის“ სტატუსს ერთი დაჭერით ანიჭებთ." },
        { id: "sms", label: "SMS", from: T.smsPhone - 0.3, caption: "მომხმარებელს SMS-ით თავისით ეცნობება, რომ შეკვეთა გზაშია." },
    ];

    // მომხმარებლის ტელეფონის ჩვენებისას დესკტოპის კურსორი არ ჩანს.
    const hide: [number, number][] = m ? [] : [[T.customerOpen + 0.3, T.customerClose], [T.smsPhone, T.duration]];

    return { mode, T, clicks, camera, scroll, chapters, hide };
}

export function buildAfterFrame(t: number, script: AfterScript) {
    const { clicks } = script;
    const { p, between, pressed, near } = timeHelpers(t, clicks);

    const shipped = t >= T.clickShipped;
    const printed = t >= T.printed;

    const orders: OrdersState = {
        total: weekCounts.total + 1,
        processing: weekCounts.processing + 1 - (shipped ? 1 : 0),
        shipped: weekCounts.shipped + (shipped ? 1 : 0),
        newRowIn: 1,
        newRowGlow: shipped ? 1 - p(T.clickShipped + 1.2, T.clickShipped + 2.4) : 0,
        status: shipped ? "shipped" : "processing",
        statusMenu: between(T.clickStatus + 0.05, T.clickShipped + 0.1),
        statusHover: near("status-shipped"),
        newInvoices: printed ? 0 : 1,
        pressed,
        near,
    };

    const detailsVisible = between(T.detailsOpen, T.clickCloseDetails + 0.2);
    const invoiceVisible = between(T.invoiceOpen, T.clickCloseInvoice + 0.2);

    return {
        t,
        page: "orders",
        pressed,
        near,
        menuOpen: false,
        orders,
        detailsVisible: detailsVisible && !invoiceVisible,
        detailsIn: p(T.detailsOpen, T.detailsOpen + 0.3) * (1 - p(T.clickCloseDetails, T.clickCloseDetails + 0.2)),
        invoiceVisible,
        invoiceIn: p(T.invoiceOpen, T.invoiceOpen + 0.3) * (1 - p(T.clickCloseInvoice, T.clickCloseInvoice + 0.2)),
        printing: between(T.clickPrint, T.printed),
        printProgress: easeInOut(p(T.clickPrint + 0.1, T.printed - 0.1)),
        printed,
        printedToast: between(T.printed, T.printed + 2.8),
        customerVisible: between(T.customerOpen, T.customerClose + 0.45),
        customerIn: easeInOut(p(T.customerOpen, T.customerOpen + 0.5)) * (1 - easeInOut(p(T.customerClose, T.customerClose + 0.45))),
        customerScroll: easeInOut(p(T.customerScrollFrom, T.customerScrollTo)),
        shipped,
        smsVisible: t >= T.smsPhone,
        smsIn: easeInOut(p(T.smsPhone, T.smsPhone + 0.55)),
        smsArrive: easeInOut(p(T.smsArrive, T.smsArrive + 0.45)),
    };
}

export type AfterFrame = ReturnType<typeof buildAfterFrame>;
