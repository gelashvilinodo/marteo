import "server-only";
import { AdminActionError } from "./actions";

export function adminJson(data: unknown, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function adminFailure(cause: unknown) {
    if (cause instanceof AdminActionError) return adminJson({ success: false, message: cause.message }, cause.status);
    console.error("Admin action failed", cause instanceof Error ? cause.name : "UnknownError");
    return adminJson({ success: false, message: "მოქმედება ვერ შესრულდა. სცადე ხელახლა." }, 500);
}
