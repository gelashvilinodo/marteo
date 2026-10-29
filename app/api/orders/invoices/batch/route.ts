import { cookies } from 'next/headers';
import { readInvoiceOrders } from '@/lib/orders/read-invoice-order';
import { buildInvoice } from '@/lib/orders/build-invoice';
import { orderJson, orderError } from '@/lib/orders/order-http';
import { OrderValidationError } from '@/lib/orders/order-validation-error';

export async function GET(request:Request) {
    try {
        const token=(await cookies()).get('marteo_session')?.value;
        if(!token)throw new OrderValidationError('გაიარე ავტორიზაცია.',401);
        let ids:unknown;
        try {ids=JSON.parse(new URL(request.url).searchParams.get('ids')??'null');}
        catch {throw new OrderValidationError('ინვოისების სია არასწორია.');}
        // This is a transport chunk limit, not a limit on the complete print queue.
        if(!Array.isArray(ids)||ids.length<1||ids.length>10||!ids.every(id=>typeof id==='string'&&id.length<=200&&id.trim()))
            throw new OrderValidationError('ერთ მოთხოვნაში აირჩიე 1-დან 10-მდე ინვოისი.');
        const rows=await readInvoiceOrders(token,[...new Set(ids as string[])]);
        return orderJson({success:true,entries:rows.map(({id,order})=>({id,invoice:buildInvoice(order,request.url)}))});
    } catch(cause) {return orderError(cause);}
}
