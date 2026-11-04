// გაცნობითი ტურების სახელები; User."seenTours" მხოლოდ ამ მნიშვნელობებს ინახავს.
export const TOUR_IDS = ["orders", "purchases", "material-purchases", "inventory", "material-inventory", "analytics", "statistics", "production", "customers", "home", "calendar"] as const;

export type TourId = (typeof TOUR_IDS)[number];

export function isTourId(value: unknown): value is TourId {
    return typeof value === "string" && (TOUR_IDS as readonly string[]).includes(value);
}
