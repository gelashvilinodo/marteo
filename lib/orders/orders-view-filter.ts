import "server-only";
import { sql, join, type Sql } from "@prisma/client-runtime-utils";
import type { OrdersFilter, OrdersPaymentFilter } from "./get-orders-page";
import { resolveBusinessPeriod } from "./business-period";

type Reader = {
    $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
};

export const ORDER_STATUS_BY_FILTER: Record<Exclude<OrdersFilter, "all">, string> = {
    processing: "PROCESSING", shipped: "SHIPPED", completed: "COMPLETED", canceled: "CANCELED", returned: "RETURNED",
};
const FILTERS: OrdersFilter[] = ["all", "processing", "shipped", "completed", "canceled", "returned"];
const PAYMENTS: OrdersPaymentFilter[] = ["all", "PAID", "UNPAID", "PARTIALLY_PAID", "COURIER_ONLY_PAID", "UNKNOWN"];

// შეკვეთების სიის ფილტრი (პერიოდი, სტატუსი, გადახდა, ძებნა) ერთ ადგილას:
// სიაც, ღილაკების რაოდენობებიც, ბეჭდვაც და ჯგუფური სტატუსიც ზუსტად ერთსა და იმავე შეკვეთებს ხედავს.
export async function resolveOrdersView(
    reader: Reader, businessId: string, params: Record<string, string | string[] | undefined>,
) {
    const text = (key: string) => typeof params[key] === "string" ? params[key].trim() : "";
    const filter: OrdersFilter = FILTERS.includes(text("status") as OrdersFilter) ? text("status") as OrdersFilter : "all";
    const payment: OrdersPaymentFilter = PAYMENTS.includes(text("payment") as OrdersPaymentFilter) ? text("payment") as OrdersPaymentFilter : "all";
    const range = await resolveBusinessPeriod(reader, businessId, text("period"), text("from"), text("to"));
    const query = text("q");
    const base = sql`o."businessId" = ${businessId} AND o."deletedAt" IS NULL AND o."createdAt" >= ${range.start} AND o."createdAt" < ${range.end}`;
    const clauses = [base];
    if (filter !== "all") clauses.push(sql`o.status = ${ORDER_STATUS_BY_FILTER[filter]}`);
    if (payment !== "all") clauses.push(sql`o."paymentStatus" = ${payment}`);
    if (query) {
        // Preserve Prisma contains semantics, including LIKE wildcards.
        const search = [
            sql`o."recipientFirstName" ILIKE ('%' || ${query} || '%')`,
            sql`o."recipientLastName" ILIKE ('%' || ${query} || '%')`,
            sql`o."shippingAddress" ILIKE ('%' || ${query} || '%')`,
            sql`EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o.id AND i."isActive" = true AND i.name ILIKE ('%' || ${query} || '%'))`,
        ];
        const possible = query.replace(/^#/, ""), number = /^\d+$/.test(possible) ? Number(possible) : null;
        if (number !== null && Number.isInteger(number) && number > 0 && number <= 2147483647) search.push(sql`o.number = ${number}`);
        const phone = query.replace(/\D/g, "");
        if (phone) search.push(sql`o."recipientPhone" LIKE ('%' || ${phone} || '%')`);
        clauses.push(sql`(${join(search, " OR ")})`);
    }
    const where: Sql = join(clauses, " AND ");
    return { filter, payment, query, range, base, where };
}

// დასაბეჭდი ინვოისები: იმპორტირებული ისტორიული, გაუქმებული და წაშლის მოთხოვნის მქონე შეკვეთები რიგში არ შედის.
// სტატუსი სხვა არ მოქმედებს: დასრულებულის ინვოისიც იბეჭდება.
export const NEW_INVOICE_SQL = sql`o."lastPrintedInvoiceVersion" IS NULL AND NOT o."imported" AND o."deleteRequestedAt" IS NULL AND o.status <> 'CANCELED'`;
export const UPDATED_INVOICE_SQL = sql`o."lastPrintedInvoiceVersion" IS NOT NULL AND o."lastPrintedInvoiceVersion" <> o."invoiceVersion" AND o."deleteRequestedAt" IS NULL AND o.status <> 'CANCELED'`;

// ღილაკების რაოდენობები მხოლოდ ეკრანზე გაფილტრული შეკვეთებიდან.
export async function getOrdersViewCounts(reader: { $queryRaw<T = unknown>(query: Sql): PromiseLike<T> }, where: Sql) {
    const [row] = await reader.$queryRaw<Array<{ newCount: string; updatedCount: string; processing: string; shipped: string }>>(sql`
        SELECT COUNT(*) FILTER (WHERE ${NEW_INVOICE_SQL})::text AS "newCount",
            COUNT(*) FILTER (WHERE ${UPDATED_INVOICE_SQL})::text AS "updatedCount",
            COUNT(*) FILTER (WHERE o.status = 'PROCESSING')::text AS processing,
            COUNT(*) FILTER (WHERE o.status = 'SHIPPED')::text AS shipped
        FROM "Order" o WHERE ${where}
    `);
    return {
        invoiceCounts: { new: Number(row?.newCount ?? 0), updated: Number(row?.updatedCount ?? 0) },
        queueCounts: { processing: Number(row?.processing ?? 0), shipped: Number(row?.shipped ?? 0) },
    };
}
