import { getPgDashboardContext } from '@/lib/auth/pg-dashboard-context';
import { createPrismaClient } from '@/lib/prisma';
import { getStocktakeDocument, StocktakeError } from '@/lib/inventory/stocktake/get-document';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request) {
    let db:ReturnType<typeof createPrismaClient>|undefined;
    try{
        const context=await getPgDashboardContext();
        if(!context)return json({error:'გაიარე ავტორიზაცია.'},401);
        const member=context.membership;if(!member)return json({error:'ბიზნესი ვერ მოიძებნა.'},403);
        db=createPrismaClient();
        const document=await db.$transaction(tx=>getStocktakeDocument(tx,member.businessId,new URL(request.url).searchParams),{isolationLevel:'RepeatableRead',maxWait:10000,timeout:30000});
        return json({document});
    }catch(e){return json({error:e instanceof StocktakeError?e.message:'მარაგის დოკუმენტი ვერ მომზადდა. სცადე ხელახლა.'},e instanceof StocktakeError?e.status:500);}finally{if(db)await db.$disconnect();}
}
