import { businessFeatureDenied } from '@/lib/business/feature-access';
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;

    if(!await getCurrentUser())return json({error:'გაიარე ავტორიზაცია.'},401);
    const member=await getCurrentBusiness();if(!member)return json({error:'ბიზნესი ვერ მოიძებნა.'},403);
    const q=(new URL(request.url).searchParams.get('q')??'').trim().slice(0,150);
    const db=createPrismaClient();
    try{const materials=await db.material.findMany({where:{businessId:member.businessId,...(q?{OR:[{name:{contains:q,mode:'insensitive' as const}},{color:{contains:q,mode:'insensitive' as const}},{size:{contains:q,mode:'insensitive' as const}}]}:{})},orderBy:[{name:'asc'},{id:'asc'}],take:50});return json({materials});}
    catch{return json({error:'მასალები ვერ მოიძებნა.'},500);}finally{await db.$disconnect();}
}
