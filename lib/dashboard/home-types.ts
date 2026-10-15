import type { HomeSummary } from "./get-home-summary";
import type {
    HomeRecentOrder,
    HomeTopProduct,
} from "./get-home-lists";
import type { HomeTrend } from "./get-home-trend";
import type { ExpenseBreakdownData } from "@/lib/analytics/get-expense-breakdown";

export type HomeRefreshSection =
    | "period"
    | "finance"
    | "stock"
    | "orders"
    | "all";

export type HomePatch = {
    summary: Partial<HomeSummary>;
    orders?: HomeRecentOrder[];
    products?: HomeTopProduct[];
    trend?: HomeTrend;
    expenses?: ExpenseBreakdownData;
};