import {
    resolveOrdersPeriod,
    type OrdersPeriod,
} from "@/lib/orders/orders-period";

export type CustomersPeriod = OrdersPeriod;

export function resolveCustomersPeriod(
    periodValue: string,
    fromValue: string,
    toValue: string,
    now = new Date(),
) {
    return resolveOrdersPeriod(
        periodValue || "month",
        fromValue,
        toValue,
        now,
    );
}