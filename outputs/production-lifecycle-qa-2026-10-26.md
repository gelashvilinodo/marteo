# Production lifecycle QA - 2026-10-26

Status: COMPLETE. The original IMPORT mode was restored through UI, verified after reload and confirmed in the database. No deployment, commit or push.

## Browser scenario
Only QA-LIFE-20261026-B records were created: material purchase #003, fabric 10 m at 5 GEL, production #004, product P-000033, order #0020 and its new QA customer. Previous QA-PROD-20261026-1620 records were untouched.

1. Purchase: 10 m, 50 GEL.
2. Production: consume 4 m plus 10 GEL overhead, create 2 products at 15 GEL each. Material remains 6 m.
3. Sale: 1 product at 40 GEL, fully paid CASH, completed. Historical COGS 15 GEL and gross profit 25 GEL.
4. Invalid correction to output quantity 1 was rejected. Database snapshots before/after prove balances and production unchanged.
5. Correction: consume 6 m total; material remains 4 m. Production total becomes 40 GEL. Existing historical sale cost stays 15 GEL; remaining product receives 25 GEL cost. This is the existing stated policy; the earlier explanation that historical profit would become 20 GEL was incorrect.
6. Full GOOD return received. User confirmed the native browser dialog. Final product stock is 2, total remaining cost 40 GEL and displayed average unit cost 20 GEL. Material stays 4 m at 5 GEL (20 GEL value).
7. Recorded simulated CASH refund of 40 GEL through UI; no bank transaction. Payment entries +40/-40 net to zero; SALE/RETURN revenue +40/-40 and costs +15/-15 net to zero. No receivable/refundable remains on the QA order.
8. Final UI state verified after reload. Original business mode restored from HYBRID to IMPORT and verified after reload plus database query.

## Fixed bug
The inventory list average unit cost was correct, but the category valuation used stale lot.unitCost=25 after return and valued two units at 50 GEL. lib/inventory/get-inventory-page.ts now prefers remainingCost / remainingQuantity, with unitCost as legacy fallback. Regression first failed 5000 != 4000, then passed at 4000. Historical sale allocations remain unchanged.

## Validation
19 production checks, 17 material-order checks, 8 full lifecycle checks, 7 inventory-export checks: 51 automated checks passed. TypeScript and targeted ESLint passed. Real browser/DB assertions additionally confirm rejected correction rollback, final stock, received return, zero revenue/COGS/payment balance and restored IMPORT mode. Native-dialog automation could not confirm receipt; user performed it and receipt was verified in UI and DB before proceeding. A pre-existing pg parallel-query deprecation warning did not fail checks.

## Evidence and retained data
JSON snapshots: outputs/production-lifecycle-browser/01-purchase.json through 10-mode-restored.json. Screenshots: inventory-final.png, material-final.png, order-final.png, mode-restored.png. All new QA records remain for user inspection. They add 4 m material and 2 products (40 GEL) to stock; the returned QA sale has zero financial effect. No persistent records were deleted.
