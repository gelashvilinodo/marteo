import 'server-only';
import { sql, Decimal, type Sql } from '@prisma/client-runtime-utils';
type Reader = { $queryRaw<T>(statement:Sql):Promise<T> };
type Lot = { remainingQuantity:string; defectiveQuantity:string; remainingCost:string };
type Material = { id:string; source:'MATERIAL'; unit:string; sku:string; name:string; brand:string; category:string; description:string; color:string; size:string; imageUrl:string|null; salePrice:null; totalStock:number; goodStock:number; defectiveStock:number; materialLots:Lot[] };
type Snapshot = { totalProducts:number; totalPages:number; currentPage:number; products:Material[] };
export async function getMaterialPicker(reader:Reader,businessId:string,q:string,requestedPage:number):Promise<Snapshot> {
    const pattern=`%${q.slice(0,150)}%`;
    const search=q?sql`(m.name ILIKE ${pattern} OR m.category ILIKE ${pattern} OR m.color ILIKE ${pattern} OR m.size ILIKE ${pattern} OR m.brand ILIKE ${pattern})`:sql`TRUE`;
    const [row]=await reader.$queryRaw<{snapshot:Snapshot}[]>(sql`
        WITH matching AS MATERIALIZED (
            SELECT m.* FROM "Material" m WHERE m."businessId"=${businessId} AND m."currentStock">0 AND ${search}
        ), pages AS (
            SELECT count(*)::int total,greatest(1,ceil(count(*)/20.0))::int "totalPages" FROM matching
        ), paging AS (
            SELECT *,least(${requestedPage}::bigint,"totalPages")::int "currentPage" FROM pages
        ), page_rows AS (
            SELECT * FROM matching ORDER BY name ASC,id ASC LIMIT 20 OFFSET (SELECT ("currentPage"-1)*20 FROM paging)
        )
        SELECT jsonb_build_object('totalProducts',pg.total,'totalPages',pg."totalPages",'currentPage',pg."currentPage",
            'products',coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id',m.id,'source','MATERIAL','unit',m.unit,'sku','','name',m.name,
                'brand',coalesce(m.brand,''),'category',coalesce(m.category,''),'description',coalesce(m.description,''),
                'color',coalesce(m.color,''),'size',coalesce(m.size,''),'imageUrl',m."imageUrl",'salePrice',NULL,
                'totalStock',m."currentStock",'goodStock',m."currentStock",'defectiveStock',0,
                'materialLots',coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'remainingQuantity',i."remainingQuantity"::text,'defectiveQuantity',i."defectiveQuantity"::text,'remainingCost',i."remainingCost"::text
                ) ORDER BY p."purchaseDate" ASC,i.id ASC)
                FROM "MaterialPurchaseItem" i JOIN "MaterialPurchase" p ON p.id=i."purchaseId"
                WHERE i."materialId"=m.id AND p."businessId"=${businessId} AND p."deletedAt" IS NULL AND p."receiptStatus"='RECEIVED'),'[]'::jsonb)
            ) ORDER BY m.name ASC,m.id ASC) FROM page_rows m),'[]'::jsonb)) snapshot FROM paging pg
    `);
    // Match Prisma Decimal's canonical string format, including fractional units.
    for(const material of row.snapshot.products)for(const lot of material.materialLots){
        lot.remainingQuantity=new Decimal(lot.remainingQuantity).toString();
        lot.defectiveQuantity=new Decimal(lot.defectiveQuantity).toString();
        lot.remainingCost=new Decimal(lot.remainingCost).toString();
    }
    return row.snapshot;
}
