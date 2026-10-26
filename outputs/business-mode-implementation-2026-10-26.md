# Business direction — 2026-10-26

- Added Business.mode enum: IMPORT / MANUFACTURING / HYBRID, default IMPORT.
- Applied additive migration 20261026190000_business_mode with Prisma migrate deploy. No data reset or deletion.
- Onboarding requires an explicit direction, separate from activity category.
- Business settings save direction through existing OWNER/ADMIN permission checks, optimistic version check and idempotent update.
- Logo update/reload response retains mode; changing direction does not delete records.
- Server dashboard context passes mode to desktop/mobile navigation and order inventory picker.
- Import: ordinary purchases, direct product inventory link, no production/material tabs.
- Manufacturing: materials purchases labelled purchases, production, materials/products inventory menu.
- Hybrid: both purchase sections, production, materials/products inventory menu.
- Purchase/production/material API routes reject incompatible mode with 403 before processing request data.
- Feature layouts redirect incompatible direct page requests to business settings.
- Material order picker and new material consumption reject import mode; historical material returns remain possible.
- Home onboarding action routes manufacturers to material purchases.

Verification:
- test-business-mode.cjs: 25 assertions passed; isolated DB fixtures rolled back. Includes all 14 purchase/production/material route handlers denying incompatible modes, direct-page redirect, DB default, preserved records across mode switches and forged new material sale denial.
- test-material-orders.cjs: 17 regression checks passed; fixtures rolled back.
- TypeScript passed. Targeted ESLint: no errors; four pre-existing onboarding navigation/image warnings.
- Brave localhost: default IMPORT menu, HYBRID menu, MANUFACTURING menu, real settings save/reload, direct importer-purchase route redirects for manufacturer.
- 360 px viewport choice: clientWidth=scrollWidth=294. Temporary viewport reset; test tab closed.
- Existing ბრიალა business temporarily switched for UI tests and restored to IMPORT. Existing QA-PROD-20261026-1620 records retained per user request.
- Onboarding account creation was not submitted in browser; its UI/payload validation was inspected and compiled.
- No commit, push or deployment.
