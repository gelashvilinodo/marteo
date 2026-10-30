import { adminRoute } from "@/lib/admin/admin-route";
import { createTemplate, listTemplates } from "@/lib/admin/support-tools";

export const dynamic = "force-dynamic";

export const GET = adminRoute(async ({ prisma }) => ({ templates: await listTemplates(prisma) }));

export const POST = adminRoute(async ({ prisma, request }) => {
    await createTemplate(prisma, await request.json() as { title?: unknown; body?: unknown });
    return { templates: await listTemplates(prisma) };
}, "json");
