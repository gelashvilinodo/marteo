import { saveOrder } from "@/lib/orders/save-order";
import { OrderValidationError } from "@/lib/orders/validate-order";

function errorResponse(message: string, status: number) {
    return Response.json(
        {
            success: false,
            message,
        },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
            },
        },
    );
}

export async function POST(request: Request) {
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

        const contentType = request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase();

        if (contentType !== "application/json") {
            return errorResponse(
                "მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.",
                415,
            );
        }

        let data: unknown;

        try {
            data = await request.json();
        } catch {
            return errorResponse(
                "გამოგზავნილი მონაცემების ფორმატი არასწორია.",
                400,
            );
        }

        const result = await saveOrder(data);

        return Response.json(
            {
                success: true,
                order: {
                    id: result.id,
                    number: result.number,
                },
                alreadySaved: result.alreadySaved,
            },
            {
                status: result.alreadySaved ? 200 : 201,
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error: unknown) {
        if (error instanceof OrderValidationError) {
            return errorResponse(
                error.message,
                error.status,
            );
        }

        console.error("Order save error", error);

        return errorResponse(
            "შეკვეთის შენახვის შედეგი ვერ დადასტურდა. შეინარჩუნე შეყვანილი ინფორმაცია და ხელახლა სცადე.",
            500,
        );
    }
}