import { businessFeatureDenied } from '@/lib/business/feature-access';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getCurrentBusiness } from '@/lib/auth/current-business';
import { getProductionOptions } from '@/lib/production/snapshot';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
    const denied=await businessFeatureDenied('manufacturing');if(denied)return denied;
try{if(!await getCurrentUser())return json({error:'გაიარე ავტორიზაცია.'},401);const member=await getCurrentBusiness();if(!member)return json({error:'ბიზნესი ვერ მოიძებნა.'},403);const p=new URL(request.url).searchParams;return json(await getProductionOptions(member.businessId,(p.get('q')??'').trim().slice(0,150),(p.get('id')??'').slice(0,100)));}catch{return json({error:'მარაგი ვერ ჩაიტვირთა. სცადე ხელახლა.'},500);}}
