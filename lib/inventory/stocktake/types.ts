export type StocktakeKind='products'|'materials';
export type StocktakeDocument={businessName:string;createdAt:string;kind:StocktakeKind;scope:'all'|'filtered';filterDescription:string;rows:Array<{id:string;name:string;details:string;unit:string;quantity:string;defective:string}>};
export const STOCKTAKE_MAX_ROWS=10000;
