import "server-only";
import { AdminAccessError } from "@/lib/admin/overview";
import { CampaignInputError } from "./admin";

const headers = { "Cache-Control": "private, no-store" };
export const adminJson = (body: unknown, status = 200) => Response.json(body, { status, headers });

// Shared error mapping for admin notification routes.
export async function adminRoute(name: string, run: () => Promise<Response>) {
    try {
        return await run();
    } catch (error) {
        if (error instanceof AdminAccessError) return adminJson({ error: "წვდომა აკრძალულია." }, 403);
        if (error instanceof CampaignInputError) return adminJson({ error: error.message }, 400);
        console.error(`Admin notifications ${name} failed`, { type: error instanceof Error ? error.name : "unknown" });
        return adminJson({ error: "მოქმედება ვერ შესრულდა. სცადე ხელახლა." }, 500);
    }
}
