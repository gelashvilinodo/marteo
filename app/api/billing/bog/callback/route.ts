import { createPrismaClient } from "@/lib/prisma";
import { verifyBogSignature } from "@/lib/payments/bog";
import { syncBankOrder } from "@/lib/subscription/bank";

export const dynamic = "force-dynamic";

const ORDER_ID = /^[A-Za-z0-9-]{8,64}$/;

// საქართველოს ბანკის callback (სერვერიდან სერვერზე). ტექსტიდან მხოლოდ შეკვეთის ნომერს ვიღებთ:
// სტატუსს და თანხას ყოველთვის ბანკის API-დან ვამოწმებთ, ამიტომ ყალბი მოთხოვნა ვერაფერს შეცვლის.
// 200 ნიშნავს, რომ მივიღეთ; სხვა პასუხზე ბანკი ხელახლა ცდის, cron კი ისედაც გადაამოწმებს.
export async function POST(request: Request) {
    const raw = await request.text();
    if (raw.length > 100_000) return new Response(null, { status: 413 });
    if (!await verifyBogSignature(raw, request.headers.get("callback-signature"))) console.warn("BOG callback signature mismatch");
    let orderId: unknown;
    try { orderId = (JSON.parse(raw) as { body?: { order_id?: unknown } }).body?.order_id; }
    catch { return new Response(null, { status: 400 }); }
    if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) return new Response(null, { status: 400 });
    const prisma = createPrismaClient();
    try {
        const known = await prisma.bankPayment.findUnique({ where: { bankOrderId: orderId }, select: { status: true } });
        // სხვა გარემოს ან უკვე დამუშავებული შეკვეთა.
        if (!known || known.status !== "PENDING") return new Response(null, { status: 200 });
        await syncBankOrder(prisma, orderId);
        return new Response(null, { status: 200 });
    } catch (error) {
        console.error("BOG callback failed", error instanceof Error ? error.name : "UnknownError");
        return new Response(null, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
