import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError } from "./validate-order";

export type OrderState =
    | "PROCESSING"
    | "SHIPPED"
    | "COMPLETED"
    | "CANCELED"
    | "RETURNED";
export function assertVersion(actual: number, expected: unknown) {
    if (typeof expected !== "number" || !Number.isInteger(expected) || actual !== expected) {
        throw new OrderValidationError("შეკვეთა უკვე შეიცვალა. განაახლე მონაცემები და სცადე ხელახლა.", 409);
    }
}
export function assertTransition(from: OrderState, to: OrderState, confirmed: unknown) {
    if (from === to) return;
    const allowed: Record<OrderState, OrderState[]> = {
        PROCESSING: ["SHIPPED", "COMPLETED", "CANCELED"],
        SHIPPED: ["COMPLETED", "CANCELED"], COMPLETED: [], CANCELED: [],
        RETURNED: [],
    };
    if (!allowed[from].includes(to)) throw new OrderValidationError("სტატუსის ეს ცვლილება დაუშვებელია.", 409);
    if (to === "COMPLETED" && confirmed !== true) {
        throw new OrderValidationError("დაადასტურე დასრულება: ამის შემდეგ შეკვეთის რედაქტირება აღარ იქნება შესაძლებელი.", 422);
    }
}
export function paymentState(total: Prisma.Decimal, paid: Prisma.Decimal, courier: Prisma.Decimal) {
    if (paid.greaterThanOrEqualTo(total)) {
        return "PAID" as const;
    }
    if (paid.isZero()) return "UNPAID" as const;
    if (courier.gt(0) && paid.eq(courier)) return "COURIER_ONLY_PAID" as const;
    return "PARTIALLY_PAID" as const;
}
export async function fingerprint(value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
