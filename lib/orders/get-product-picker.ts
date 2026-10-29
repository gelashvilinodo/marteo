import 'server-only';
import { sql, join, Decimal, type Sql } from '@prisma/client-runtime-utils';

type Reader = { $queryRaw<T>(statement: Sql): Promise<T> };
type Product = { id:string; sku:string; name:string; brand:string; category:string; description:string; color:string; size:string; imageUrl:string|null; salePrice:string|null; totalStock:number; goodStock:number; defectiveStock:number };
type Snapshot = { products:Product[]; totalProducts:number; currentPage:number; totalPages:number; pageSize:number };

// One statement gives count, clamped page and balances the same database snapshot.
export async function getProductPicker(reader:Reader,businessId:string,q:string,requestedPage:number):Promise<Snapshot> {
    const words=q.split(/\s+/).filter(Boolean).map(word=>{
        const pattern=`%${word}%`;
        return sql`(i.sku ILIKE ${pattern} OR i.color ILIKE ${pattern} OR i.size ILIKE ${pattern}
            OR p.name ILIKE ${pattern} OR p.brand ILIKE ${pattern} OR p.category ILIKE ${pattern})`;
    });
    const search=words.length?join(words,' AND '):sql`TRUE`;
    const [row]=await reader.$queryRaw<{snapshot:Snapshot}[]>(sql`
        WITH matching AS MATERIALIZED (
            SELECT i.id,i.sku,i.color,i.size,i."imageUrl",i."salePrice",i."productId",
                p.name,p.brand,p.category,p.description
            FROM "InventoryItem" i JOIN "Product" p ON p.id=i."productId" AND p."businessId"=${businessId}
            WHERE i."businessId"=${businessId} AND i."isActive" AND ${search}
            AND EXISTS (SELECT 1 FROM "InventoryStockLot" l
                LEFT JOIN "PurchaseItem" pi ON pi.id=l."purchaseItemId"
                LEFT JOIN "Purchase" b ON b.id=pi."purchaseId"
                WHERE l."inventoryItemId"=i.id AND l."remainingQuantity">0
                AND (l."purchaseItemId" IS NULL OR (b."businessId"=${businessId} AND b."receiptStatus"='RECEIVED')))
        ), pages AS (
            SELECT count(*)::int total, greatest(1,ceil(count(*)/20.0))::int "totalPages" FROM matching
        ), paging AS (
            SELECT *,least(${requestedPage}::bigint,"totalPages")::int "currentPage" FROM pages
        ), page_rows AS (
            SELECT * FROM matching ORDER BY name ASC,"productId" ASC,color ASC,size ASC,id ASC
            LIMIT 20 OFFSET (SELECT ("currentPage"-1)*20 FROM paging)
        )
        SELECT jsonb_build_object('totalProducts',pg.total,'currentPage',pg."currentPage",'totalPages',pg."totalPages",'pageSize',20,
            'products',coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id',r.id,'sku',r.sku,'name',r.name,'brand',coalesce(r.brand,''),'category',coalesce(r.category,''),
                'description',coalesce(r.description,''),'color',coalesce(r.color,''),'size',coalesce(r.size,''),
                'imageUrl',r."imageUrl",'salePrice',r."salePrice"::text,
                'totalStock',s.total,'goodStock',s.total-s.defective,'defectiveStock',s.defective
            ) ORDER BY r.name ASC,r."productId" ASC,r.color ASC,r.size ASC,r.id ASC)
            FROM page_rows r CROSS JOIN LATERAL (
                SELECT coalesce(sum(l."remainingQuantity"),0) total,coalesce(sum(l."remainingDefectiveQuantity"),0) defective
                FROM "InventoryStockLot" l LEFT JOIN "PurchaseItem" pi ON pi.id=l."purchaseItemId"
                LEFT JOIN "Purchase" b ON b.id=pi."purchaseId"
                WHERE l."inventoryItemId"=r.id AND (l."purchaseItemId" IS NULL OR (b."businessId"=${businessId} AND b."receiptStatus"='RECEIVED'))
            ) s),'[]'::jsonb)) snapshot FROM paging pg
    `);
    for(const product of row.snapshot.products)if(product.salePrice!==null)product.salePrice=new Decimal(product.salePrice).toFixed(2);
    return row.snapshot;
}
