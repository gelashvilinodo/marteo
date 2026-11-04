import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { BusinessMode } from "@/lib/business/business-mode";
import { planStateFrom, type PlanState } from "./plan-state";
import { clampMode, type PlanTier } from "./plans";

type Db = PrismaClient | Prisma.TransactionClient;

export async function readPlanState(db: Db, businessId: string, now = new Date()): Promise<PlanState> {
    const row = await db.subscription.findUnique({
        where: { businessId },
        select: { plan: true, status: true, expiresAt: true, currentPeriodStart: true, cancelAtPeriodEnd: true },
    });
    return planStateFrom(row, now);
}

// გეგმის შეცვლისას დაუშვებელი მიმართულება იმპორტზე გადადის (Start: მხოლოდ იმპორტი,
// Business: არა „ორივე“). დაბლოკილ ბიზნესს მიმართულება არ ეცვლება.
export async function applyPlanMode(tx: Prisma.TransactionClient, businessId: string, tier: PlanTier | null) {
    if (!tier) return null;
    const business = await tx.business.findUnique({ where: { id: businessId }, select: { mode: true } });
    if (!business) return null;
    const mode = clampMode(tier, business.mode as BusinessMode);
    if (mode === business.mode) return null;
    await tx.business.update({ where: { id: businessId }, data: { mode } });
    return mode;
}
