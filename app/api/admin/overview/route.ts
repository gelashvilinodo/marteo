import { AdminAccessError, getAdminOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

export async function GET() {
    const headers = { "Cache-Control": "private, no-store" };
    try {
        return Response.json(await getAdminOverview(), { headers });
    } catch (error) {
        if (error instanceof AdminAccessError) {
            return Response.json({ message: "წვდომა აკრძალულია." }, { status: 403, headers });
        }
        console.error("Admin overview failed");
        return Response.json({ message: "მონაცემები ვერ ჩაიტვირთა." }, { status: 500, headers });
    }
}
