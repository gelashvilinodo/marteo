import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { getInventoryPage } from '@/lib/inventory/get-inventory-page';
import { readMaterialInventoryPage } from '@/lib/material-inventory/get-page';
import { hasBusinessFeature } from '@/lib/business/business-mode';
import { UNITS } from '@/lib/material-purchases/input';
import { STOCKTAKE_MAX_ROWS, type StocktakeDocument } from './types';
export class StocktakeError extends Error {constructor(message:string,public status=422){super(message);}}
export async function getStocktakeDocument(tx:Prisma.TransactionClient,businessId:string,params:URLSearchParams):Promise<StocktakeDocument> {
    const kind=params.get('kind');if(kind!=='products'&&kind!=='materials')throw new StocktakeError('მარაგის ტიპი არასწორია.');
    const business=await tx.business.findUnique({where:{id:businessId},select:{name:true,mode:true}});if(!business)throw new StocktakeError('ბიზნესი ვერ მოიძებნა.',403);
    if(kind==='materials'&&!hasBusinessFeature(business.mode,'manufacturing'))throw new StocktakeError('მასალების მარაგზე წვდომა არ გაქვს.',403);
    const scope=params.get('scope');if(scope!=='all'&&scope!=='filtered')throw new StocktakeError('აირჩიე მთლიანი მარაგი ან მიმდინარე ფილტრი.');
    const filters:Record<string,string>={};
    if(scope==='filtered')for(const key of ['q','category','color','size','sort','status','filter']){const v=params.get(key);if(v){if(v.length>200)throw new StocktakeError('ძებნის ტექსტი ზედმეტად გრძელია.');filters[key]=v;}}
    const parts:string[]=[];if(filters.q)parts.push('ძებნა: '+filters.q);for(const [key,label]of [['category','კატეგორია'],['color','ფერი'],['size','ზომა']])if(filters[key])parts.push(label+': '+filters[key]);
    let rows:StocktakeDocument['rows'];let count:number;
    if(kind==='products'){
        const data=await getInventoryPage(tx,businessId,filters,STOCKTAKE_MAX_ROWS+1);count=data.totalProducts;
        const label={all:'',low:'დაბალი მარაგი',exhausted:'ამოწურული',defective:'წუნდებული'}[data.filter];if(label)parts.push(label);
        rows=data.products.map(p=>({id:p.id,name:p.name,details:[p.sku,p.brand,p.category,p.color,p.size].filter(Boolean).join(' · '),unit:'ცალი',quantity:String(p.totalStock),defective:String(p.defectiveStock)}));
    }else{
        const data=await readMaterialInventoryPage(tx,businessId,filters,STOCKTAKE_MAX_ROWS+1);count=data.count;
        const label={all:'',available:'ხელმისაწვდომი',exhausted:'ამოწურული',transit:'გზაში',defective:'დეფექტური'}[data.filter];if(label)parts.push(label);
        rows=data.items.map(m=>({id:m.id,name:m.name,details:[m.brand,m.category,m.color,m.size,m.characteristics,Number(m.inTransit)>0?`გზაში: ${m.inTransit}`:null].filter(Boolean).join(' · '),unit:UNITS.find(([key])=>key===m.unit)?.[1]??m.unit,quantity:new Prisma.Decimal(m.currentStock).plus(m.defectiveStock).toString(),defective:m.defectiveStock}));
    }
    if(count>STOCKTAKE_MAX_ROWS)throw new StocktakeError('მარაგი ძალიან დიდია ერთი დოკუმენტისთვის. დააზუსტე ფილტრი (მაქსიმუმ 10 000 ჩანაწერი).');
    return {businessName:business.name,createdAt:new Date().toISOString(),kind,scope,filterDescription:scope==='all'?'მთლიანი მარაგი':parts.join(' · ')||'მიმდინარე სია',rows};
}
