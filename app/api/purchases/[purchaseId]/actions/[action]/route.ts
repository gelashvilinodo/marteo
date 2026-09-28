import { NextResponse } from "next/server";

import {
    changePurchaseStatus,
    PurchaseActionError,
} from "@/lib/purchases/change-purchase-status";

function errorResponse(message: string, status: number) {
    return NextResponse.json(
        {
            success: false,
            error: message,
        },
        {
            status,
            headers: { "Cache-Control": "no-store" },
        },
    );
}

export async function POST(
    request: Request,
    context: {
        params: Promise<{
            purchaseId: string;
            action: string;
        }>;
    },
) {
    try {
        if (
            request.headers.get("origin") !==
            new URL(request.url).origin
        ) {
            return errorResponse(
                "მოთხოვნის წყარო დაუშვებელია.",
                403,
            );
        }

        const { purchaseId, action } = await context.params;

        if (
            action !== "delete" &&
            action !== "archive" &&
            action !== "restore"
        ) {
            return errorResponse(
                "მოქმედება ვერ მოიძებნა.",
                404,
            );
        }

        // მომხმარებლის ავტორიზაცია და ბიზნესზე წვდომა
        // მოწმდება სერვერული ფუნქციის შიგნით.
        const result = await changePurchaseStatus(
            purchaseId,
            action,
        );

        return NextResponse.json(
            {
                success: true,
                purchase: result,
            },
            {
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        if (error instanceof PurchaseActionError) {
            return errorResponse(
                error.message,
                error.status,
            );
        }

        console.error("Purchase action failed", error);

        return errorResponse(
            "მოქმედების შედეგი ვერ დადასტურდა. განაახლე სია და გადაამოწმე პარტიის მდგომარეობა.",
            500,
        );
    }
}
