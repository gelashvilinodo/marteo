import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { orderJson } from "@/lib/orders/order-http";

import { getHomeSummary } from "@/lib/dashboard/get-home-summary";
import { getHomeLists } from "@/lib/dashboard/get-home-lists";
import { getHomeTrend } from "@/lib/dashboard/get-home-trend";
import { getHomeExpenses } from "@/lib/dashboard/get-home-expenses";

import type {
    HomePatch,
    HomeRefreshSection,
} from "@/lib/dashboard/home-types";

const sections: HomeRefreshSection[] = [
    "period",
    "finance",
    "stock",
    "orders",
    "all",
];

export async function GET(request: Request) {
    try {
        const context = await getPgDashboardContext();

        if (!context) {
            return orderJson(
                { success: false, message: "გაიარე ავტორიზაცია." },
                401,
            );
        }

        if (!context.membership) {
            return orderJson(
                { success: false, message: "ბიზნესი ვერ მოიძებნა." },
                403,
            );
        }

        const params = new URL(request.url).searchParams;
        const requested = params.get("section") ?? "all";

        if (!sections.includes(requested as HomeRefreshSection)) {
            return orderJson(
                {
                    success: false,
                    message: "განახლების მოთხოვნა არასწორია.",
                },
                400,
            );
        }

        const section = requested as HomeRefreshSection;
        const businessId = context.membership.businessId;

        const full = section === "all";
        const orderChange = section === "orders";

        const finance =
            full ||
            orderChange ||
            section === "period" ||
            section === "finance";

        const orders =
            full ||
            orderChange ||
            section === "period";

        const stock =
            full ||
            orderChange ||
            section === "stock";

        const products =
            full ||
            orderChange ||
            section === "period";

        const recentOrders = full || orderChange;

        const summary = await getHomeSummary(
            businessId,
            {
                period: params.get("period") ?? "month",
                from: params.get("from") ?? "",
                to: params.get("to") ?? "",
            },
            {
                finance,
                orders,
                stock,
                businessState: full,
            },
        );

        const patch: HomePatch = {
            summary: {},
        };

        if (full) {
            patch.summary = summary;
        } else {
            if (finance) {
                patch.summary.sales = summary.sales;
                patch.summary.profit = summary.profit;
                patch.summary.partialProfit = summary.partialProfit;
            }

            if (orders) {
                patch.summary.orders = summary.orders;
            }

            if (stock) {
                patch.summary.stock = summary.stock;
            }

            if (finance || orders) {
                patch.summary.period = summary.period;
                patch.summary.from = summary.from;
                patch.summary.to = summary.to;
                patch.summary.periodError = summary.periodError;
            }
        }

        if (full && summary.isNewBusiness) {
            patch.orders = [];
            patch.products = [];

            return orderJson({
                success: true,
                data: patch,
            });
        }

        const [lists, trend, expenses] = await Promise.all([
            recentOrders || products
                ? getHomeLists(
                    businessId,
                    summary.from,
                    summary.to,
                    recentOrders && products
                        ? "all"
                        : recentOrders
                            ? "orders"
                            : "products",
                )
                : Promise.resolve(null),

            finance
                ? getHomeTrend(
                    businessId,
                    summary.from,
                    summary.to,
                    summary.profit !== null,
                )
                : Promise.resolve(null),
            finance
                ? getHomeExpenses(
                    businessId,
                    summary.from,
                    summary.to,
                )
                : Promise.resolve(null),
        ]);



        if (lists) {
            if (recentOrders) patch.orders = lists.orders;
            if (products) patch.products = lists.products;
        }

        if (trend) {
            patch.trend = trend;
        }

        if (expenses) {
            patch.expenses = expenses;
        }

        return orderJson({
            success: true,
            data: patch,
        });
    } catch (cause: unknown) {
        console.error(
            "Home section refresh failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return orderJson(
            {
                success: false,
                message: "მონაცემები ვერ განახლდა. სცადე ხელახლა.",
            },
            500,
        );
    }
}