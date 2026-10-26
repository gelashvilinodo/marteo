# Inventory stocktake — 2026-10-26

Implemented on Products and Materials inventory: A4 print preview and downloadable fillable PDF, all inventory or currently applied filters, across all pages. Snapshot contains physical stock including defective quantity; in-transit stock is excluded. PDF has actual count, difference and note fields plus signature lines. Installed iOS PWA uses the existing invoice PDF fallback.

Validation: TypeScript passed; targeted ESLint passed. Seven isolated database/PDF checks passed with fixture rollback, including business isolation, fractional material quantities, filters, permissions and multipage Georgian A4 output. Browser verified 29 product rows and 3 material rows. Actual browser download contained 3 A4 pages and 87 fillable fields. PDF first/last pages visually inspected. Export above 10,000 rows returns an explicit request to narrow filters rather than silently truncating.

Physical printing and real-device iPhone/PWA AirPrint remain unverified. No deployment, commit, production data changes or business-settings loader edits.
