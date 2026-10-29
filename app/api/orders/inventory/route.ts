import { hasBusinessFeature, businessFeatureMessage } from "@/lib/business/business-mode";
import { getMaterialPicker } from "@/lib/orders/get-material-picker";
import { getProductPicker } from "@/lib/orders/get-product-picker";

import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPgReader } from "@/lib/database/pg-reader";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function GET(request: Request) {
    let reader: ReturnType<typeof createPgReader> | undefined;

    try {
        const context = await getPgDashboardContext();

        if (!context) {
            return json(
                {
                    success: false,
                    message: "გაიარე ავტორიზაცია.",
                },
                401,
            );
        }

        const url = new URL(request.url);

        const query = (
            url.searchParams.get("q") ?? ""
        ).trim();

        const rawPage = Number(
            url.searchParams.get("page") ?? "1",
        );

        const requestedPage =
            Number.isSafeInteger(rawPage) && rawPage > 0
                ? rawPage
                : 1;

        const membership = context.membership;

        if (!membership) {
            return json(
                {
                    success: false,
                    message: "ბიზნესი ვერ მოიძებნა.",
                },
                403,
            );
        }

        const businessId = membership.businessId;
        const materialsRequested = url.searchParams.get("kind") === "materials";
        if (materialsRequested && !hasBusinessFeature(membership.business.mode, "manufacturing")) {
            const message = businessFeatureMessage("manufacturing");
            return json({ success: false, error: message, message }, 403);
        }

        reader = createPgReader();
        const result = materialsRequested
            ? await getMaterialPicker(reader, businessId, query, Math.min(requestedPage, 1000000))
            : await getProductPicker(reader, businessId, query, requestedPage);

        return json({
            success: true,
            ...result,
        });
    } catch (error: unknown) {
        console.error(
            "Order inventory lookup error",
            error instanceof Error ? error.name : "UnknownError",
        );

        return json(
            {
                success: false,
                message:
                    "მარაგის პროდუქტების ჩატვირთვა ვერ მოხერხდა.",
            },
            500,
        );
    } finally {
        if (reader) {
            await reader.$disconnect();
        }
    }
}