import { getCurrentUserWithClient } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { isTourId } from "@/lib/tours/tour-ids";

function json(data: unknown, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

// ტურის დასრულება ან გამოტოვება: შემდეგ შესვლაზე ავტომატურად აღარ ჩაირთვება.
export async function POST(request: Request) {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
        return json({ success: false, message: "მოთხოვნის წყარო დაუშვებელია." }, 403);
    }
    const body = await request.json().catch(() => null) as { tour?: unknown } | null;
    if (!isTourId(body?.tour)) {
        return json({ success: false, message: "უცნობი ტური." }, 400);
    }
    const tour = body.tour;
    const prisma = createPrismaClient();
    try {
        const user = await getCurrentUserWithClient(() => prisma);
        if (!user) return json({ success: false, message: "გაიარეთ ავტორიზაცია." }, 401);
        await prisma.$executeRaw`
            UPDATE "User" SET "seenTours" = array_append("seenTours", ${tour})
            WHERE id = ${user.id} AND NOT (${tour} = ANY("seenTours"))
        `;
        return json({ success: true });
    } catch {
        console.error("Tour progress request failed");
        return json({ success: false, message: "ტურის შენახვა ვერ მოხერხდა." }, 500);
    } finally {
        await prisma.$disconnect();
    }
}
