import { costSafeJson } from "@/lib/business/redact-costs";
import { apiAccessDenied } from "@/lib/business/access";
import { businessFeatureDenied } from '@/lib/business/feature-access';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { getProductionOptions } from '@/lib/production/snapshot';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
    const accessDenied = await apiAccessDenied("PRODUCTION", "view"); if (accessDenied) return accessDenied;
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;
try{if(!await getCurrentUser())return json({error:'გაიარეთ ავტორიზაცია.'},401);const member=await getCurrentBusiness();if(!member)return json({error:'ბიზნესი ვერ მოიძებნა.'},403);const p=new URL(request.url).searchParams;return costSafeJson(await getProductionOptions(member.businessId,(p.get('q')??'').trim().slice(0,150),(p.get('id')??'').slice(0,100)));}catch{return json({error:'მარაგი ვერ ჩაიტვირთა. სცადეთ ხელახლა.'},500);}}
