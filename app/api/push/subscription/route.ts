import { createPrismaClient } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { guardMutation } from "@/lib/security/mutation-request";
import { isPushEndpoint, isPushKey } from "@/lib/push/web-push";
import { supportJson, supportUnauthorized } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

// Any signed-in member may subscribe; the admin receives new support messages
// and business members receive support replies.
async function put(request: Request) {
    const user = await getCurrentUser();
    if (!user) return supportUnauthorized();
    const body = await request.json() as Body;
    const { endpoint } = body;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!isPushEndpoint(endpoint) || !isPushKey(p256dh, 65) || !isPushKey(auth, 16)) {
        return supportJson({ success: false, message: "შეტყობინებების გამოწერა არასწორია." }, 422);
    }
    const prisma = createPrismaClient();
    try {
        await prisma.webPushSubscription.upsert({
            where: { endpoint },
            create: { endpoint, p256dh, auth, userId: user.id },
            update: { p256dh, auth, userId: user.id },
        });
        // A small cap keeps one account from accumulating stale devices.
        const extra = await prisma.webPushSubscription.findMany({
            where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: 10, select: { id: true },
        });
        if (extra.length) await prisma.webPushSubscription.deleteMany({ where: { id: { in: extra.map(row => row.id) } } });
        return supportJson({ success: true });
    } finally { await prisma.$disconnect(); }
}

async function remove(request: Request) {
    const user = await getCurrentUser();
    if (!user) return supportUnauthorized();
    const { endpoint } = await request.json() as Body;
    if (typeof endpoint !== "string") return supportJson({ success: false }, 422);
    const prisma = createPrismaClient();
    try {
        await prisma.webPushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
        return supportJson({ success: true });
    } finally { await prisma.$disconnect(); }
}

export const PUT = guardMutation(put, "json");
export const DELETE = guardMutation(remove, "json");
