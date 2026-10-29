import "server-only";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { SupportError } from "./support-chat";

export function supportJson(data: unknown, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function supportFailure(cause: unknown) {
    const limited = rateLimitResponse(cause);
    if (limited) return limited;
    if (cause instanceof SupportError) return supportJson({ success: false, message: cause.message }, cause.status);
    console.error("Support chat failed", cause instanceof Error ? cause.name : "UnknownError");
    return supportJson({ success: false, message: "მოქმედება ვერ შესრულდა. სცადე ხელახლა." }, 500);
}

export const supportUnauthorized = () => supportJson({ success: false, message: "ავტორიზაცია საჭიროა." }, 401);
export const supportForbidden = () => supportJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
