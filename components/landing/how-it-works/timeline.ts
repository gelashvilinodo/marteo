import { customer, order, ordered, orderedAfterStock, month, weekCounts } from "./data";
import { easeInOut, timeHelpers, type CameraKey, type Chapter, type Click, type Mode, type Script as EngineScript, type ScrollKey } from "./engine";
import type { OrdersState } from "./Pages";

// დემო დროზეა აწყობილი: ყველაფერი, რაც ეკრანზე ჩანს, t წამის სუფთა ფუნქციაა.
// ასე თავისუფლად შეიძლება ნებისმიერ თავზე გადასვლა და თავიდან დაწყება.

type TimeKey =
    | "clickNew" | "formOpen" | "clickPhone" | "phoneFrom" | "phoneTo" | "lookup" | "found"
    | "clickStock" | "pickerOpen" | "clickSearch" | "searchFrom" | "searchTo" | "clickAdd" | "pickerClose"
    | "clickCourier" | "courierType" | "clickPay" | "clickFull" | "clickMethod" | "clickTransfer"
    | "clickBank" | "bankFrom" | "bankTo" | "clickSave" | "orders"
    | "menuInventory" | "clickInventory" | "inventory" | "stockDrop"
    | "menuAnalytics" | "clickAnalytics" | "analytics" | "salesCount" | "profitCount" | "end" | "duration";

export type Times = Record<TimeKey, number>;

export type Script = EngineScript<Times>;

// ორივე რეჟიმის საერთო ნაწილი. ტელეფონზე ფორმის სქროლსა და მენიუს ცოტა მეტი დრო სჭირდება.
function times(mode: Mode): Times {
    const m = mode === "mobile";
    const a = m ? 0.6 : 0; // ფორმის სქროლი პროდუქტებამდე
    const b = a + (m ? 0.6 : 0); // ფორმის სქროლი გადახდამდე
    const c = b + (m ? 0.9 : 0); // მენიუ მარაგებამდე
    const d = c + (m ? 0.9 : 0); // მენიუ ანალიტიკამდე

    return {
        clickNew: 2.0,
        formOpen: 2.25,
        clickPhone: 3.5,
        phoneFrom: 3.7,
        phoneTo: 4.9,
        lookup: 4.95,
        found: 5.75,
        clickStock: 8.0 + a,
        pickerOpen: 8.2 + a,
        clickSearch: 9.3 + a,
        searchFrom: 9.5 + a,
        searchTo: 10.3 + a,
        clickAdd: 11.5 + a,
        pickerClose: 11.7 + a,
        clickCourier: 13.5 + b,
        courierType: 13.75 + b,
        clickPay: 14.7 + b,
        clickFull: 15.7 + b,
        clickMethod: 16.7 + b,
        clickTransfer: 17.55 + b,
        clickBank: 18.4 + b,
        bankFrom: 18.6 + b,
        bankTo: 19.6 + b,
        clickSave: 20.9 + b,
        orders: 21.5 + b,
        menuInventory: 25.0 + b,
        clickInventory: 25.5 + c,
        inventory: 25.7 + c,
        stockDrop: 27.4 + c,
        menuAnalytics: 30.2 + c,
        clickAnalytics: 30.7 + d,
        analytics: 30.9 + d,
        salesCount: 31.9 + d,
        profitCount: 33.4 + d,
        end: 36.8 + d,
        duration: 39.3 + d,
    };
}

export function buildScript(mode: Mode): Script {
    const T = times(mode);
    const m = mode === "mobile";

    const clicks: Click[] = [
        { t: T.clickNew, target: "new-order", move: 1.2 },
        { t: T.clickPhone, target: "phone", move: 0.9 },
        { t: T.clickStock, target: "stock-open", move: 1.0 },
        { t: T.clickSearch, target: "picker-search", move: 0.8 },
        { t: T.clickAdd, target: "picker-add", move: 0.9 },
        { t: T.clickCourier, target: "courier", move: 1.0 },
        { t: T.clickPay, target: "pay-select", move: 0.7 },
        { t: T.clickFull, target: "pay-full", move: 0.55 },
        { t: T.clickMethod, target: "method-select", move: 0.7 },
        { t: T.clickTransfer, target: "method-transfer", move: 0.5 },
        { t: T.clickBank, target: "bank", move: 0.6 },
        { t: T.clickSave, target: "save", move: 1.0 },
        ...(m ? [{ t: T.menuInventory, target: "menu", move: 0.6 }] : []),
        { t: T.clickInventory, target: "nav-inventory", move: 1.1 },
        ...(m ? [{ t: T.menuAnalytics, target: "menu", move: 0.6 }] : []),
        { t: T.clickAnalytics, target: "nav-analytics", move: 1.0 },
    ];

    const camera: CameraKey[] = m
        ? [
              { t: 0, dur: 0, target: null, scale: 1 },
              { t: T.stockDrop - 0.7, dur: 0.8, target: "stock-row", scale: 1.22 },
              { t: T.menuAnalytics - 0.8, dur: 0.7, target: null, scale: 1 },
              { t: T.profitCount - 0.6, dur: 0.8, target: "profit-card", scale: 1.25 },
              { t: T.end, dur: 0.9, target: null, scale: 1 },
          ]
        : [
              { t: 0, dur: 0, target: null, scale: 1 },
              { t: T.clickPhone - 0.2, dur: 0.9, target: "customer", scale: 1.28 },
              { t: T.found + 1.6, dur: 0.9, target: null, scale: 1 },
              { t: T.pickerClose + 0.2, dur: 0.8, target: "order-item", scale: 1.3 },
              { t: T.clickCourier - 0.9, dur: 0.9, target: "payment", scale: 1.45, anchorY: 0.42 },
              { t: T.bankTo + 0.4, dur: 0.8, target: null, scale: 1 },
              { t: T.orders + 0.5, dur: 0.9, target: "order-row", scale: 1.55 },
              { t: T.clickInventory - 1.3, dur: 0.8, target: null, scale: 1 },
              { t: T.stockDrop - 0.8, dur: 0.9, target: "stock-row", scale: 1.75 },
              { t: T.clickAnalytics - 1.5, dur: 0.8, target: null, scale: 1 },
              { t: T.salesCount - 0.6, dur: 0.9, target: "cards-row", scale: 1.22 },
              { t: T.profitCount - 0.2, dur: 0.9, target: "profit-card", scale: 1.75 },
              { t: T.end, dur: 1.0, target: null, scale: 1 },
          ];

    // სქროლი ეხება მხოლოდ იმ გვერდს, რომელიც ახლა ჩანს (data-demo-scroll).
    const scroll: ScrollKey[] = m
        ? [
              { t: 0, dur: 0, target: null },
              { t: T.found + 1.3, dur: 0.7, target: "products", offset: 12 },
              { t: T.pickerClose + 0.3, dur: 0.6, target: "order-item", offset: 12 },
              { t: T.clickCourier - 1.4, dur: 0.8, target: "payment", offset: 12 },
              { t: T.clickBank - 0.3, dur: 0.6, target: "payment", offset: -120 },
              { t: T.orders, dur: 0, target: null },
              { t: T.orders + 0.3, dur: 0.8, target: "order-row", offset: 330 },
              { t: T.inventory, dur: 0, target: null },
              { t: T.inventory + 0.4, dur: 0.7, target: "stock-row", offset: 180 },
              { t: T.analytics, dur: 0, target: null },
              { t: T.analytics + 0.4, dur: 0.8, target: "profit-card", offset: 220 },
          ]
        : [
              { t: 0, dur: 0, target: null },
              { t: T.pickerClose + 0.1, dur: 0.7, target: "order-item", offset: 150 },
              { t: T.orders, dur: 0, target: null },
          ];

    const chapters: Chapter[] = [
        { id: "customer", label: "მომხმარებელი", from: 0, caption: "საკმარისია ტელეფონის ნომერი — სახელი, გვარი და მისამართი ბაზიდან თავისით ივსება." },
        { id: "product", label: "პროდუქტი", from: T.clickStock - 0.9, caption: "პროდუქტს მარაგიდან ირჩევთ — ფასი და ნაშთი უკვე ცნობილია." },
        { id: "payment", label: "გადახდა", from: T.clickCourier - 1.4, caption: "მიუთითეთ კურიერი და გადახდა — ჯამი მყისიერად ითვლება." },
        { id: "orders", label: "შეკვეთები", from: T.orders, caption: "შეკვეთა სიაში ჩნდება და მზადაა გასაგზავნად." },
        { id: "inventory", label: "მარაგი", from: (m ? T.menuInventory : T.clickInventory) - 0.6, caption: "მარაგი ავტომატურად მცირდება — ხელით დათვლა აღარ გჭირდებათ." },
        { id: "analytics", label: "მოგება", from: (m ? T.menuAnalytics : T.clickAnalytics) - 0.6, caption: "გაყიდვა და მოგება თავისით ემატება ანალიტიკას." },
    ];

    // შენახვის შემდეგ კურსორი ცოტა ხნით ქრება, რომ შეკვეთების გვერდის ზუმს არ ეფარებოდეს.
    const hide: [number, number][] = m ? [] : [[T.orders + 0.6, T.clickInventory - 1.5]];

    return { mode, T, clicks, camera, scroll, chapters, hide };
}

// ეკრანზე ჩანს თუ არა ესა თუ ის მდგომარეობა, t-ის მიხედვით.
export function buildFrame(t: number, script: Script) {
    const { T, clicks } = script;
    const { p, type, between, pressed, near } = timeHelpers(t, clicks);

    const page: "home" | "orders" | "inventory" | "analytics" =
        t < T.orders ? "home" : t < T.inventory ? "orders" : t < T.analytics ? "inventory" : "analytics";

    const formVisible = between(T.formOpen, T.orders);
    const pickerVisible = between(T.pickerOpen, T.pickerClose + 0.2);

    const focus =
        between(T.clickPhone, T.lookup) ? "phone"
        : between(T.clickSearch, T.clickAdd) ? "picker-search"
        : between(T.clickCourier, T.clickPay) ? "courier"
        : between(T.clickBank, T.clickSave) ? "bank"
        : null;

    const found = t >= T.found;
    const fill = (index: number) => t >= T.found + index * 0.14;

    const added = t >= T.orders + 0.5;
    const orders: OrdersState = {
        total: weekCounts.total + (added ? 1 : 0),
        processing: weekCounts.processing + (added ? 1 : 0),
        shipped: weekCounts.shipped,
        newRowIn: p(T.orders + 0.25, T.orders + 0.85),
        newRowGlow: t >= T.orders ? 1 - p(T.orders + 2.6, T.orders + 3.8) : 0,
        status: "processing",
        statusMenu: false,
        statusHover: false,
        newInvoices: added ? 1 : 0,
        pressed,
        near,
    };

    const menuOpen = script.mode === "mobile" && (between(T.menuInventory, T.clickInventory + 0.25) || between(T.menuAnalytics, T.clickAnalytics + 0.25));

    return {
        t,
        page,
        pressed,
        near,
        p,
        formVisible,
        formIn: p(T.formOpen, T.formOpen + 0.35),
        formOut: page === "home" ? 0 : 1,
        focus,
        phone: type(customer.phone, T.phoneFrom, T.phoneTo),
        lookupBusy: between(T.lookup, T.found),
        found,
        firstName: fill(0) ? customer.firstName : "",
        lastName: fill(1) ? customer.lastName : "",
        zoneFilled: fill(2),
        address: fill(3) ? customer.address : "",
        autofillGlow: found ? 1 - p(T.found + 1.2, T.found + 2.4) : 0,
        pickerVisible,
        pickerIn: p(T.pickerOpen, T.pickerOpen + 0.28) * (1 - p(T.pickerClose, T.pickerClose + 0.2)),
        search: type(order.search, T.searchFrom, T.searchTo),
        itemAdded: t >= T.pickerClose,
        itemGlow: t >= T.pickerClose ? 1 - p(T.pickerClose + 1.0, T.pickerClose + 2.2) : 0,
        courier: t >= T.courierType ? String(order.courier) : "0",
        payMenu: between(T.clickPay + 0.05, T.clickFull + 0.1),
        paid: t >= T.clickFull,
        methodMenu: between(T.clickMethod + 0.05, T.clickTransfer + 0.1),
        transfer: t >= T.clickTransfer,
        bank: type(order.bank, T.bankFrom, T.bankTo),
        saving: between(T.clickSave, T.orders),
        toast: between(T.orders + 0.2, T.orders + 3.4),
        orders,
        menuOpen,
        menuIn: menuOpen ? 1 : 0,
        navTarget: t >= T.clickAnalytics - 0.02 ? "analytics" : t >= T.clickInventory - 0.02 ? "inventory" : null,
        stock: t >= T.stockDrop ? orderedAfterStock : ordered.stock,
        stockDrop: p(T.stockDrop, T.stockDrop + 0.7),
        stockGlow: t >= T.stockDrop - 0.3 ? 1 - p(T.stockDrop + 2.4, T.stockDrop + 3.4) : 0,
        stockUnits: month.stockUnits - (t >= T.stockDrop ? 1 : 0),
        sales: easeInOut(p(T.salesCount, T.salesCount + 0.9)),
        profit: easeInOut(p(T.profitCount, T.profitCount + 1.1)),
        ended: t >= T.end,
    };
}

export type Frame = ReturnType<typeof buildFrame>;
