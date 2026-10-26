import { Prisma } from '@/generated/prisma/browser';
import { UNITS } from '@/lib/material-purchases/input';
export const money=(v:string|number)=>`${new Prisma.Decimal(v).toFixed(2)} ₾`;
export const quantity=(v:string)=>new Prisma.Decimal(v).toString();
export const unit=(v:string)=>UNITS.find(([key])=>key===v)?.[1]??v;
export function dateInput(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');}
