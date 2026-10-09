import { mutateCustomers } from "@/lib/customers/customer-mutations";
import { OrderValidationError } from "@/lib/orders/validate-order";
import { readOrderBody } from "@/lib/orders/order-http";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

async function handle(
    request: Request,
    action: "create" | "edit" | "delete",
) {
    try {
        const body = await readOrderBody(request);
        const result = await mutateCustomers(action, body);

        return json({
            success: true,
            ...result,
        });
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) {
            return json({
                success: false,
                message: cause.message,
            }, cause.status);
        }

        console.error("Customer operation failed", cause);

        return json({
            success: false,
            message:
                "მოქმედების შედეგი ვერ დადასტურდა. მონაცემები გადაამოწმე ხელახლა ცდამდე.",
        }, 500);
    }
}

export async function POST(request: Request) {
    return handle(request, "create");
}

export async function PATCH(request: Request) {
    return handle(request, "edit");
}

export async function DELETE(request: Request) {
    return handle(request, "delete");
}