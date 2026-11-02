import "server-only";
import { canSeeCosts } from "./permissions";
import { getBusinessAccess } from "./access";

// ველები, რომლებიც თვითღირებულებას ან მისგან გამოთვლილ თანხას შეიცავს.
// მნიშვნელობა null ხდება და არა იშლება, რომ კლიენტის ტიპები არ დაირღვეს.
const COST_KEYS = new Set([
    "unitCost", "totalCost", "averageUnitCost", "stockValue", "remainingCost", "finalUnitCost",
    "materialCostSnapshot", "costTotal", "profit", "grossProfit", "margin",
]);

function isPlain(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function redactCosts<T>(value: T): T {
    if (Array.isArray(value)) return value.map(redactCosts) as T;
    if (!isPlain(value)) return value;
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = COST_KEYS.has(key) ? null : redactCosts(item);
    return copy as T;
}

export async function hideCostsIfNeeded<T>(value: T): Promise<T> {
    return canSeeCosts(await getBusinessAccess()) ? value : redactCosts(value);
}

export async function costSafeJson(data: unknown, status = 200) {
    return Response.json(await hideCostsIfNeeded(data), { status, headers: { "Cache-Control": "private, no-store" } });
}
