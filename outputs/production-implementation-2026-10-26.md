# წარმოება — 26.10.2026

Implemented locally in /Users/nodogelashvili/projects/marteo. No commit, push or app deployment performed.

- `/dashboard/production`: unlocked existing sidebar item, paginated list, status counts/filters, search, expandable details, loading and retry states.
- Purchase-style animated full panel for creating/editing production, animated material/product cards, responsive 16px text controls, guarded close, reduced-motion support.
- Materials can only be chosen from the current business's received usable stock. Saving an unfinished production consumes stock immediately; editing restores the exact earlier allocations before reallocating FIFO, all within one transaction.
- Additional named costs and a generic estimated overhead amount; concise hover/tap explanation. No automatic duplicate Expense records are created.
- Products can be new or existing inventory variants. Multiple outputs use explicit percentage cost shares totalling 100% on completion. Largest-remainder allocation preserves cents.
- Completion creates costed InventoryStockLot records. Existing inventory listing and order FIFO accept manufactured products without creating importer purchase records.
- Completed-production corrections preserve costs already allocated out of the lot. Remaining quantity and cost are adjusted; impossible corrections are rejected with an explanation. A consumed output cannot be removed. Existing catalog metadata is edited through inventory rather than renamed globally from production.
- Fresh OWNER/ADMIN checks, business-scoped queries, Origin validation, business/inventory locks, Serializable writes, optimistic versions, persistent request idempotency and frozen retries after uncertain responses.
- Product photo preparation/upload reuses existing compression/format-validation helpers. No new actual-photo upload was performed in this QA run.
- Cross-tab production events refresh affected material/product inventory views.

## Validation

- Additive migration `20261026160000_production` inspected and applied to the configured database; Prisma generation/validation passed.
- TypeScript, targeted ESLint and git diff whitespace checks passed.
- `node scripts/test-production.cjs`: 19 real database assertions, all fixtures rolled back. Covers fractional material costs, draft stock consumption, idempotence, permissions, completion, corrections, existing order stock allocation, post-sale cost preservation, stale versions, foreign material IDs, consumed purchase protection, cent conservation, multiple outputs and replenishing existing products.
- Anonymous GET `/api/production` and `/api/production/options`: 401.
- Authenticated browser: saved materials-only draft (2.5m × 8.80 = 22 GEL plus 5 GEL estimated overhead), completed with 3 products (27 GEL total), edited to 3m and 4 products (31.40 GEL total, 7.85 GEL/unit), checked persisted DB and existing product inventory. Only isolated named QA records used; exact fixture rows subsequently removed after guard checks.
- Browser at 360px: dialog scrollWidth=clientWidth=360, no input/select/textarea right overflow; tooltip opens on tap. Mobile viewport restored.

Business-type onboarding, plan gating, material sales in orders and broader tax/accounting reports are separate follow-up work.
