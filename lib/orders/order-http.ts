import { OrderValidationError } from "./validate-order";
export function orderJson(data: unknown, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function readOrderBody(request: Request) {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new OrderValidationError("მოთხოვნის წყარო დაუშვებელია.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new OrderValidationError("მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.", 415);
    try { return await request.json() as unknown; }
    catch { throw new OrderValidationError("მონაცემების ფორმატი არასწორია.", 400); }
}
export function orderError(cause: unknown) {
    if (cause instanceof OrderValidationError) return orderJson({ success: false, message: cause.message }, cause.status);
    console.error("Order operation failed", cause instanceof Error ? cause.name : "UnknownError");
    return orderJson({ success: false, message: "მოქმედების შედეგი ვერ დადასტურდა. იგივე მოთხოვნით სცადე ხელახლა." }, 500);
}
