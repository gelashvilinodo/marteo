import { Decimal } from '@prisma/client-runtime-utils';
type QuantityKey='quantity'|'quantityDelta'|'returnedQuantity'|'transferredQuantity';
type Scalar<T>=T extends Decimal?number:T;
export type NumericQuantities<T>=T extends Decimal|Date?T:T extends Array<infer I>?NumericQuantities<I>[]:T extends object?{[K in keyof T]:K extends QuantityKey?Scalar<T[K]>:NumericQuantities<T[K]>}:T;
// Quantities cross API/UI boundaries as numbers (maximum six decimals). Money stays Decimal.
export function numericQuantities<T>(value:T):NumericQuantities<T>{
    function visit(input:unknown):unknown{if(!input||typeof input!=='object'||input instanceof Date||Decimal.isDecimal(input))return input;if(Array.isArray(input))return input.map(visit);return Object.fromEntries(Object.entries(input).map(([key,v])=>[key,['quantity','quantityDelta','returnedQuantity','transferredQuantity'].includes(key)&&Decimal.isDecimal(v)?Number(v.toString()):visit(v)]));}
    return visit(value) as NumericQuantities<T>;
}
export const qadd=(a:number,b:number)=>new Decimal(a).plus(b).toDecimalPlaces(6).toNumber();
export const qsub=(a:number,b:number)=>new Decimal(a).minus(b).toDecimalPlaces(6).toNumber();
export const validQuantity=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=2147483647&&new Decimal(v).decimalPlaces()<=6;
export const lineRevenue=(price:Decimal,quantity:number)=>price.mul(quantity).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
export const quantityLabel=(quantity:number,unit?:string)=>`${new Decimal(quantity).toString()} ${({'PCS':'ცალი','M':'მეტრი','CM':'სმ','MM':'მმ','M2':'მ²','M3':'მ³','KG':'კგ','G':'გ','L':'ლიტრი','ML':'მლ'} as Record<string,string>)[unit??'PCS']??unit}`;

export const qvalue=(v:number)=>new Decimal(v).toDecimalPlaces(6).toNumber();
