import type { OrderEntry } from "@/lib/orders/get-orders-page";
import type { CustomerEntry } from "@/lib/customers/get-customers-page";
import type { InventoryProduct } from "@/components/dashboard/inventory/InventoryView";

// ბარათები ჩატში ჩანს, მაგრამ მოდელს არასდროს ეგზავნება: ტელეფონი, მისამართი
// და ფოტოები მხოლოდ ბრაუზერამდე მიდის.
export type AiOrderCard = {
    id: string;
    number: number | null;
    createdAt: string;
    status: OrderEntry["status"];
    paymentStatus: OrderEntry["paymentStatus"];
    customer: string;
    phone: string;
    total: string;
    productQuantity: number;
    title: string;
    imageUrl: string | null;
};

export type AiContentState = "planned" | "today" | "partly_done" | "done" | "overdue" | "canceled";

// კონტენტ-კალენდრის ჩანაწერი ბარათისთვის; დეტალები კალენდრის ფანჯარაში იტვირთება.
export type AiContentCard = {
    id: string;
    title: string;
    type: string;
    customType: string | null;
    scheduledAt: string | null;
    state: AiContentState;
    channels: Array<{ platform: string; customPlatform: string | null; done: boolean }>;
};

// AI-ის დაწერილი პოსტის მონახაზი: ბაზაში არ ინახება, ღილაკი კალენდრის ფორმას ავსებს.
export type AiPostDraft = {
    id: string;
    title: string;
    text: string;
    type: string;
    platforms: string[];
    date: string;
    time: string;
};

// notes: რჩევის მიზეზი ბარათზე (id → ტექსტი). restock: შემოთავაზებული რაოდენობა
// შესაძენი სიისთვის. planned: უკვე სიაში მყოფი რაოდენობა.
type CardExtras = { notes?: Record<string, string> };

export type AiRestockSuggestion = { quantity: number; reason: string };

export type AiCardGroup =
    | ({ kind: "orders"; total: number; items: AiOrderCard[] } & CardExtras)
    | ({
        kind: "stock";
        total: number;
        items: InventoryProduct[];
        restock?: Record<string, AiRestockSuggestion>;
        planned?: Record<string, number>;
    } & CardExtras)
    | ({ kind: "customers"; total: number; items: CustomerEntry[] } & CardExtras)
    | ({ kind: "content"; total: number; items: AiContentCard[] } & CardExtras)
    // saved: კალენდარში უკვე დამატებული მონახაზები.
    | ({ kind: "draft"; total: number; items: AiPostDraft[]; saved?: Record<string, boolean> } & CardExtras);

export const AI_CARD_LIMIT = 30;

export function orderCard(order: OrderEntry): AiOrderCard {
    return {
        id: order.id,
        number: order.number,
        createdAt: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        customer: [order.recipientFirstName, order.recipientLastName].filter(Boolean).join(" "),
        phone: order.recipientPhone,
        total: order.total,
        productQuantity: order.productQuantity,
        title: order.items[0]?.name ?? "",
        imageUrl: order.items.find((item) => item.imageUrl)?.imageUrl ?? null,
    };
}

function mergeMaps<T>(first?: Record<string, T>, second?: Record<string, T>) {
    return first || second ? { ...second, ...first } : undefined;
}

// ერთ პასუხში ერთი ტიპის რამდენიმე ძებნა ერთ ჯგუფად ერთიანდება.
export function mergeCardGroups(groups: AiCardGroup[]): AiCardGroup[] {
    const merged = new Map<AiCardGroup["kind"], AiCardGroup>();

    for (const group of groups) {
        const current = merged.get(group.kind);

        if (!current) {
            merged.set(group.kind, group);
            continue;
        }

        const ids = new Set(current.items.map((item) => item.id));
        const added = (group.items as { id: string }[]).filter((item) => !ids.has(item.id));
        merged.set(group.kind, {
            ...current,
            total: current.total + added.length,
            items: [...current.items, ...added].slice(0, AI_CARD_LIMIT),
            notes: mergeMaps(current.notes, group.notes),
            ...(current.kind === "stock" && group.kind === "stock"
                ? { restock: mergeMaps(current.restock, group.restock), planned: mergeMaps(current.planned, group.planned) }
                : {}),
        } as AiCardGroup);
    }

    return [...merged.values()];
}
