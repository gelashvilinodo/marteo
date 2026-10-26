# Production cycle QA — 2026-10-26

Local browser: authenticated Brave, localhost:3000. Configured PostgreSQL inspected for the exact QA records only. Not a production deployment verification.

## Browser lifecycle

QA tag: QA-PROD-20261026-1620. Existing business: ბრიალა. All new UI writes used a new QA material/product; existing stock was not consumed.

1. Created material purchase #002 in transit: 10 m × GEL 8 plus GEL 20 shipping = GEL 100; unit cost GEL 10.
2. Confirmed receipt: database material stock 10 m; source lot remaining cost GEL 100.
3. Created production #003 as IN_PROGRESS, using 2.5 m: material GEL 25 + labour GEL 5 + estimated overhead GEL 10 = GEL 40. Database stock 7.5 m. No inventory product created. Completion button absent with blank product.
4. Edited draft to use 3 m and specify 5 products at sale price GEL 25; saved and reloaded. Materials GEL 30; total GEL 45; unit cost GEL 9. Material stock 7 m.
5. Completed production: one inventory lot, quantity 5, remaining cost GEL 45. Material not consumed twice.
6. Created and completed order #0019 for 2 QA products at GEL 25: revenue GEL 50, exact COGS GEL 18, costComplete true, contribution GEL 32. Database and Analytics movement agree. Product stock 3.
7. Edited completed production after sale: overhead GEL 10 -> GEL 15. Production total GEL 50; remaining lot cost GEL 32 for 3 units; historical sold cost and financial COGS remain GEL 18.

## UI

- Picker fixed height 640 px in tested desktop and 360×800 viewport.
- At 360 px: picker clientWidth = scrollWidth = 334; search font 16px.
- Production form clientWidth = scrollWidth = 360; completion absent with blank product.
- List-only skeleton observed while title/search remain mounted.
- Only IN_PROGRESS article has production-light-sweep animation; completed articles have none.
- Unsaved form triggers native confirm. Cancel path retained the exact unsaved input. Native dialog automation could not complete reliably; user pressed OK to close. A fresh browser tab verified the saved list afterward. Temporary viewport reset and temporary tab closed.
- Production success toast was absent after save settled; precise visual appearance-to-removal timing was not independently captured (2-second code timer inspected).
- Found another persistent toast in NewOrderDrawer: added cleanup-safe 2-second timer after drawer closes.

## Automated checks

- scripts/test-production.cjs: 19 passed, fixtures rolled back.
- scripts/test-material-orders.cjs: 17 passed, fixtures rolled back.
- scripts/test-material-purchases.cjs: 21 passed, fixtures rolled back (includes 9 input checks).
- Total: 57 automated checks passed.
- TypeScript passed; NewOrderDrawer targeted ESLint passed.
- Existing pg concurrent-query deprecation warning remains in material-order tests; no failed assertion.

## Cleanup

UI QA writes are persisted and labelled with the exact tag above. Permanent cleanup requested from user; pending approval at report creation. No Storage uploads, account creation, SMS or email sends occurred in this UI test. No push/deploy performed.
