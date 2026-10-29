import type { OrderInvoiceData } from './invoice-types';
export type InvoiceBatchEntry = { id:string; invoice:OrderInvoiceData };

// Sequential, bounded chunks avoid one HTTP/auth request per invoice and keep order.
export async function* loadInvoiceBatches(ids:string[],signal:AbortSignal) {
    const uniqueIds=[...new Set(ids)];
    for(let offset=0;offset<uniqueIds.length;offset+=10) {
        if(signal.aborted)throw new DOMException('ჩატვირთვა შეწყდა.','AbortError');
        const chunk=uniqueIds.slice(offset,offset+10);
        const params=new URLSearchParams({ids:JSON.stringify(chunk)});
        const response=await fetch(`/api/orders/invoices/batch?${params}`,{cache:'no-store',signal});
        const data=await response.json() as {success?:boolean;message?:string;entries?:InvoiceBatchEntry[]};
        if(!response.ok||!data.success||!Array.isArray(data.entries)||data.entries.length!==chunk.length||data.entries.some((entry,index)=>!entry||entry.id!==chunk[index]||!entry.invoice))
            throw new Error(data.message||'ინვოისები ვერ ჩაიტვირთა.');
        if(signal.aborted)throw new DOMException('ჩატვირთვა შეწყდა.','AbortError');
        yield data.entries;
    }
}
