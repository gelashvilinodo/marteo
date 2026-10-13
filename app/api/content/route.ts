import { createContent } from "@/lib/content/create-content";
import {
    readOrderBody,
    orderJson,
    orderError,
} from "@/lib/orders/order-http";

export async function POST(request: Request) {
    try {
        const body = await readOrderBody(request);
        const content = await createContent(body);

        return orderJson(
            { success: true, content },
            content.alreadySaved ? 200 : 201,
        );
    } catch (cause: unknown) {
        return orderError(cause);
    }
}