import { adminRoute } from "@/lib/admin/admin-route";
import { deleteTemplate, listTemplates, updateTemplate } from "@/lib/admin/support-tools";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ templateId: string }> };

export async function PATCH(request: Request, context: Context) {
    const { templateId } = await context.params;
    return adminRoute(async ({ prisma, request: guarded }) => {
        await updateTemplate(prisma, templateId, await guarded.json() as { title?: unknown; body?: unknown });
        return { templates: await listTemplates(prisma) };
    }, "json")(request);
}

export async function DELETE(request: Request, context: Context) {
    const { templateId } = await context.params;
    return adminRoute(async ({ prisma }) => {
        await deleteTemplate(prisma, templateId);
        return { templates: await listTemplates(prisma) };
    }, "empty")(request);
}
