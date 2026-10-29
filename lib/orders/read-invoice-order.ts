import 'server-only';
import { createHash } from 'node:crypto';
import { createPgReader } from '@/lib/database/pg-reader';
import { getInvoiceOrder, getInvoiceOrders } from './get-invoice-order';
import { OrderValidationError } from './order-validation-error';

// A request-owned connection and read-only snapshot; no cross-request data cache.
type Reader = Pick<ReturnType<typeof createPgReader>, '$queryRaw'>;
export async function withInvoiceReader<T>(token:string|undefined,read:(reader:Reader,businessId:string)=>Promise<T>):Promise<T> {
    if(!token)throw new OrderValidationError('გაიარე ავტორიზაცია.',401);
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const reader=createPgReader();
    try {
        return await reader.withReadTransaction(async tx=>{
            const [access]=await tx.$queryRaw<Array<{expiresAt:Date;status:string;businessId:string|null}>>`
                SELECT s."expiresAt",u.status::text status,m."businessId"
                FROM "Session" s JOIN "User" u ON u.id=s."userId"
                LEFT JOIN LATERAL (
                    SELECT "businessId" FROM "BusinessMembership" WHERE "userId"=u.id
                    ORDER BY "createdAt" ASC,"businessId" ASC LIMIT 1
                ) m ON true
                WHERE s."tokenHash"=${tokenHash} LIMIT 1
            `;
            if(!access||access.status!=='ACTIVE'||access.expiresAt<=new Date())
                throw new OrderValidationError('გაიარე ავტორიზაცია.',401);
            if(!access.businessId)throw new OrderValidationError('ბიზნესი ვერ მოიძებნა.',403);
            return read(tx,access.businessId);
        });
    } finally {await reader.$disconnect();}
}

export function readInvoiceOrder(token:string|undefined,orderId:string) {
    return withInvoiceReader(token,(reader,businessId)=>getInvoiceOrder(reader,businessId,orderId));
}

export function readInvoiceOrders(token:string|undefined,orderIds:string[]) {
    return withInvoiceReader(token,async(reader,businessId)=>{
        const rows=await getInvoiceOrders(reader,businessId,orderIds);
        const byId=new Map(rows.map(row=>[row.id,row.order]));
        return orderIds.map(id=>{
            const order=byId.get(id);
            if(!order)throw new OrderValidationError('შეკვეთა ვერ მოიძებნა.',404);
            return {id,order};
        });
    });
}
