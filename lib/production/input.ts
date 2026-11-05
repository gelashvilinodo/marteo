import { Prisma } from '@/generated/prisma/browser';
import { MaterialError, text, validDate } from '@/lib/material-purchases/input';
export { MaterialError as ProductionError } from '@/lib/material-purchases/input';
type Decimal=InstanceType<typeof Prisma.Decimal>;
const optional=(v:unknown,max:number)=>text(v??'',max);
export const PRICING_METHODS=['MANUAL','FIXED_PROFIT','MARKUP_PERCENT','MARGIN_PERCENT'] as const;
export type ProductionPricingMethod=(typeof PRICING_METHODS)[number];
// KEEP: მარაგიდან არჩეული პროდუქტის ფასი არ იცვლება (ბაზაში pricingMethod=null).
function readPricing(o:Record<string,unknown>,inventoryItemId:string|null){
    const raw=o.pricingMethod??'MANUAL';
    if(raw==='KEEP'){if(!inventoryItemId)throw new MaterialError('ფასის შენარჩუნება მხოლოდ მარაგიდან არჩეულ პროდუქტზეა შესაძლებელი.');return {pricingMethod:null,pricingValue:null};}
    if(!PRICING_METHODS.includes(raw as ProductionPricingMethod))throw new MaterialError('ფასის წესი არასწორია.');
    const method=raw as ProductionPricingMethod,source=o.pricingValue??(method==='MANUAL'?o.salePrice:undefined);
    if(method==='MANUAL'&&(source===''||source==null))return {pricingMethod:method,pricingValue:null};
    const value=amount(source,method==='MANUAL'?'გასაყიდი ფასი':method==='FIXED_PROFIT'?'მოგება':method==='MARKUP_PERCENT'?'ფასნამატი':'მარჟა');
    if(method==='MARGIN_PERCENT'&&value.gte(100))throw new MaterialError('მარჟა 100%-ზე ნაკლები უნდა იყოს.');
    return {pricingMethod:method,pricingValue:value};
}
// იგივე ფორმულები, რაც იმპორტის შესყიდვებში; ფასი ერთეულის თვითღირებულებას ეყრდნობა.
export function salePriceFor(method:ProductionPricingMethod|null,value:Decimal|null,unitCost:Decimal|null){
    if(!method||!value)return null;
    if(method==='MANUAL')return value;
    if(!unitCost)return null;
    const price=method==='FIXED_PROFIT'?unitCost.plus(value):method==='MARKUP_PERCENT'?unitCost.mul(value.div(100).plus(1)):unitCost.div(new Prisma.Decimal(1).minus(value.div(100)));
    const rounded=price.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
    if(rounded.gte('10000000000'))throw new MaterialError('გასაყიდი ფასი ზედმეტად დიდია.');
    return rounded;
}
export function amount(v:unknown,label:string,precision=2){
    const s=typeof v==='string'?v.trim().replace(',','.') : '';
    if(!new RegExp(precision===0?'^\\d{1,8}$':`^\\d{1,8}(\\.\\d{1,${precision}})?$`).test(s))throw new MaterialError(`${label}: მიუთითეთ სწორი არაუარყოფითი რიცხვი.`);
    return new Prisma.Decimal(s);
}
export function readProduction(raw:unknown){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new MaterialError('წარმოების მონაცემები არასწორია.');
    const r=raw as Record<string,unknown>;
    const requestId=text(r.requestId,100,true);if(!/^[\w-]{10,100}$/.test(requestId))throw new MaterialError('მოთხოვნის კოდი არასწორია.');
    const date=text(r.productionDate,10,true);if(!validDate(date))throw new MaterialError('მიუთითეთ სწორი თარიღი.');
    if(r.status!=='IN_PROGRESS'&&r.status!=='COMPLETED')throw new MaterialError('წარმოების სტატუსი არასწორია.');
    if(!Array.isArray(r.materials)||!r.materials.length||r.materials.length>50)throw new MaterialError('აირჩიეთ 1-დან 50-მდე მასალა.');
    const materials=r.materials.map(v=>{if(!v||typeof v!=='object')throw new MaterialError('მასალის მონაცემები არასწორია.');const i=v as Record<string,unknown>,quantity=amount(i.quantity,'მასალის რაოდენობა',6);if(quantity.lte(0))throw new MaterialError('მასალის რაოდენობა ნულზე მეტი უნდა იყოს.');return {materialId:text(i.materialId,100,true),quantity};});
    if(new Set(materials.map(m=>m.materialId)).size!==materials.length)throw new MaterialError('ერთი მასალა მხოლოდ ერთხელ აირჩიეთ.');
    if(!Array.isArray(r.outputs)||r.outputs.length>20)throw new MaterialError('პროდუქტების მონაცემები არასწორია.');
    const outputs=r.outputs.map(v=>{if(!v||typeof v!=='object')throw new MaterialError('პროდუქტის მონაცემები არასწორია.');const o=v as Record<string,unknown>;
        const quantity=amount(o.quantity||'0','პროდუქტის რაოდენობა',0).toNumber(),share=amount(o.costShare||'0','ხარჯის წილი');
        if(share.gt(100))throw new MaterialError('ხარჯის წილი 100%-ს არ უნდა აღემატებოდეს.');
        const rowKey=text(o.rowKey,100,true);if(!/^[\w-]{10,100}$/.test(rowKey))throw new MaterialError('პროდუქტის კოდი არასწორია.');
        const name=optional(o.name,200),category=optional(o.category,150),inventoryItemId=optional(o.inventoryItemId,100)||null;
        if(r.status==='COMPLETED'&&(!quantity||(!inventoryItemId&&(!name||!category))))throw new MaterialError('დასრულებისთვის მიუთითეთ პროდუქტის სახელი, კატეგორია და რაოდენობა.');
        return {rowKey,inventoryItemId,name,category,brand:optional(o.brand,150),description:optional(o.description,3000),color:optional(o.color,150),size:optional(o.size,150),quantity,costShare:share,...readPricing(o,inventoryItemId)};
    });
    if(new Set(outputs.map(o=>o.rowKey)).size!==outputs.length)throw new MaterialError('პროდუქტის კოდი განმეორებულია.');
    if(r.status==='COMPLETED'&&(!outputs.length||!outputs.reduce((s,o)=>s.plus(o.costShare),new Prisma.Decimal(0)).equals(100)))throw new MaterialError('პროდუქტების ხარჯის წილები ჯამში 100% უნდა იყოს.');
    if(!Array.isArray(r.additionalCosts)||r.additionalCosts.length>30)throw new MaterialError('დამატებითი ხარჯების მონაცემები არასწორია.');
    const additionalCosts=r.additionalCosts.map(v=>{if(!v||typeof v!=='object')throw new MaterialError('ხარჯის მონაცემები არასწორია.');const c=v as Record<string,unknown>;return {name:text(c.name,150,true),amount:amount(c.amount,'დამატებითი ხარჯი')};});
    return {requestId,id:optional(r.id,100)||null,version:optional(r.version,40),name:optional(r.name,200),productionDate:new Date(`${date}T00:00:00+04:00`),status:r.status as 'IN_PROGRESS'|'COMPLETED',note:optional(r.note,3000),overheadCost:amount(r.overheadCost||'0','სავარაუდო საწარმოო ხარჯი'),additionalCosts,materials,outputs};
}
export type ProductionInput=ReturnType<typeof readProduction>;
// Keep the fractional quantity in Decimal; assign only whole cents to a consumption.
export function materialCost(total:Decimal,remaining:Decimal,take:Decimal){return take.equals(remaining)?total:total.mul(take).div(remaining).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);}
export function outputCosts(total:Decimal,shares:Decimal[]){
    const weight=shares.reduce((s,w)=>s.plus(w),new Prisma.Decimal(0));
    if(!shares.length||weight.isZero())return shares.map(()=>new Prisma.Decimal(0));
    const values=shares.map((s,index)=>{const exact=total.mul(100).mul(s).div(weight);return {index,cents:exact.floor(),remainder:exact.minus(exact.floor())};});
    let left=total.mul(100).minus(values.reduce((s,v)=>s.plus(v.cents),new Prisma.Decimal(0))).toNumber();
    for(const v of [...values].sort((a,b)=>b.remainder.comparedTo(a.remainder)||a.index-b.index)){if(left-->0)v.cents=v.cents.plus(1);}
    return values.map(v=>v.cents.div(100));
}
