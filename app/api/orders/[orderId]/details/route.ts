import { getOrderRecords } from "@/lib/orders/get-order-records";
import { serializeOrderRecord } from "@/lib/orders/serialize-order-record";
import { orderJson } from "@/lib/orders/order-http";
import { withOrderPgReadContext } from "@/lib/orders/order-pg-read-context";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
    return withOrderPgReadContext(async (client, businessId) => {
        const { orderId } = await context.params;
        const [record] = await getOrderRecords(client, businessId, [orderId], true);
        if (!record) return orderJson({ success: false, message: "შეკვეთა ვერ მოიძებნა." }, 404);
        return orderJson({ success: true, order: serializeOrderRecord(record, true) });
    });
}
