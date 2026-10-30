import { AdminAccessError } from "@/lib/admin/overview";
import { exportBusinesses, exportUsers } from "@/lib/admin/export";
import { parseBusinessFilters, parseUserFilters } from "@/lib/admin/lists";
import { adminJson } from "@/lib/admin/action-http";
import { guardMutation } from "@/lib/security/mutation-request";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ kind: string }> };

// POST: an export writes an audit entry, so it gets the same origin guard as other admin actions.
export async function POST(request: Request, context: Context) {
    const { kind } = await context.params;
    return guardMutation(() => run(kind, Object.fromEntries(new URL(request.url).searchParams)), "empty")(request);
}

async function run(kind: string, params: Record<string, string>) {
    try {
        if (kind === "users") return adminJson({ success: true, ...await exportUsers(parseUserFilters(params)) });
        if (kind === "businesses") return adminJson({ success: true, ...await exportBusinesses(parseBusinessFilters(params)) });
        return adminJson({ success: false, message: "ექსპორტის ტიპი არასწორია." }, 404);
    } catch (cause) {
        if (cause instanceof AdminAccessError) return adminJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
        console.error("Admin export failed", cause instanceof Error ? cause.name : "UnknownError");
        return adminJson({ success: false, message: "ექსპორტი ვერ მოხერხდა." }, 500);
    }
}
