import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readPlan } from "@/lib/business/team-server";
import { AiChatError, MARTEO_AI_MODEL } from "./anthropic-client";
import { AI_MONTHLY_LIMITS, formatResetDay, nextTbilisiMonthStart, tbilisiMonthStart, type AiQuota } from "./ai-quota";

type Db = PrismaClient | Prisma.TransactionClient;
type Kind = "CHAT" | "PURCHASE_DRAFT" | "TITLE";

// USD per million tokens. Haiku 5.5 doubles to the long-context rate above 100K prompt tokens.
// Cache writes are 1.25x input and reads 0.1x input. This is an estimate for the admin panel, not the invoice.
const PRICES: Record<string, { input: number; output: number; longInput: number; longOutput: number }> = {
    "claude-haiku-5-5": { input: 0.10, output: 0.50, longInput: 0.50, longOutput: 2.50 },
};
const LONG_CONTEXT = 100_000;

/** Adds up the usage of every API call made for one user action. */
export class AiUsageMeter {
    calls = 0;
    inputTokens = 0;
    outputTokens = 0;
    cacheReadTokens = 0;
    cacheWriteTokens = 0;
    costUsd = 0;

    constructor(readonly model = MARTEO_AI_MODEL) {}

    add(usage: Anthropic.Usage) {
        const input = usage.input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        const read = usage.cache_read_input_tokens ?? 0;
        const write = usage.cache_creation_input_tokens ?? 0;
        const price = PRICES[this.model] ?? PRICES[MARTEO_AI_MODEL];
        const long = input + read + write > LONG_CONTEXT;
        const inRate = long ? price.longInput : price.input;
        const outRate = long ? price.longOutput : price.output;
        this.calls++;
        this.inputTokens += input;
        this.outputTokens += output;
        this.cacheReadTokens += read;
        this.cacheWriteTokens += write;
        this.costUsd += (input * inRate + write * inRate * 1.25 + read * inRate * 0.1 + output * outRate) / 1_000_000;
    }
}

function monthLimit(plan: string, override: number | null) {
    return override ?? AI_MONTHLY_LIMITS[plan as keyof typeof AI_MONTHLY_LIMITS] ?? AI_MONTHLY_LIMITS.FREE;
}

export async function getAiQuota(db: Db, businessId: string, now = new Date()): Promise<AiQuota> {
    const [business, plan, used] = await Promise.all([
        db.business.findUnique({ where: { id: businessId }, select: { aiDisabled: true, aiMonthlyLimit: true } }),
        readPlan(db, businessId, now),
        db.aiUsage.count({ where: { businessId, counted: true, createdAt: { gte: tbilisiMonthStart(now) } } }),
    ]);
    return {
        plan, used, disabled: business?.aiDisabled ?? false,
        limit: monthLimit(plan, business?.aiMonthlyLimit ?? null),
        custom: business?.aiMonthlyLimit != null,
        resetsAt: nextTbilisiMonthStart(now).toISOString(),
    };
}

export type AiUsageReservation = { id: string; kind: Kind; meter: AiUsageMeter; quota: AiQuota };

/**
 * Checks the switch and the monthly limit and books a slot before the model is called,
 * under a business row lock so parallel requests cannot pass the limit together.
 */
export async function startAiUsage(prisma: PrismaClient, input: { businessId: string; businessName: string; userId: string | null; kind: Exclude<Kind, "TITLE"> }): Promise<AiUsageReservation> {
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${input.businessId} FOR UPDATE`;
        const quota = await getAiQuota(tx, input.businessId);
        if (quota.disabled) throw new AiChatError("მართეო AI ამ ბიზნესისთვის გამორთულია. დაგვიკავშირდი დახმარების ჩათში.", 403);
        if (quota.used >= quota.limit) {
            throw new AiChatError(`ამ თვის AI ლიმიტი ამოიწურა (${quota.limit}/${quota.limit}). ლიმიტი განახლდება ${formatResetDay(quota.resetsAt)}.`, 429);
        }
        const row = await tx.aiUsage.create({
            data: { businessId: input.businessId, businessName: input.businessName, userId: input.userId, kind: input.kind, model: MARTEO_AI_MODEL, counted: true },
            select: { id: true },
        });
        return { id: row.id, kind: input.kind, meter: new AiUsageMeter(), quota: { ...quota, used: quota.used + 1 } };
    });
}

/** Stores the final token counts. A failed action costs us tokens but not the user's limit; one that never reached the API leaves no row. */
export async function finishAiUsage(prisma: PrismaClient, reservation: AiUsageReservation, failed: boolean) {
    const { meter } = reservation;
    try {
        if (!meter.calls) {
            await prisma.aiUsage.delete({ where: { id: reservation.id } });
            return;
        }
        await prisma.aiUsage.update({
            where: { id: reservation.id },
            data: {
                counted: !failed, failed, calls: meter.calls,
                inputTokens: meter.inputTokens, outputTokens: meter.outputTokens,
                cacheReadTokens: meter.cacheReadTokens, cacheWriteTokens: meter.cacheWriteTokens,
                costUsd: meter.costUsd.toFixed(6),
            },
        });
    } catch (error) {
        console.error("AI usage record failed", error instanceof Error ? error.name : "UnknownError");
    }
}

/** For background calls (chat titles) that never count toward the limit. */
export async function recordAiUsage(prisma: Db, input: { businessId: string; userId: string | null; kind: Kind; meter: AiUsageMeter; failed?: boolean }) {
    if (!input.meter.calls) return;
    const { meter } = input;
    try {
        const business = await prisma.business.findUnique({ where: { id: input.businessId }, select: { name: true } });
        await prisma.aiUsage.create({
            data: {
                businessId: input.businessId, businessName: business?.name ?? "", userId: input.userId, kind: input.kind,
                model: meter.model, counted: false, failed: input.failed ?? false, calls: meter.calls,
                inputTokens: meter.inputTokens, outputTokens: meter.outputTokens,
                cacheReadTokens: meter.cacheReadTokens, cacheWriteTokens: meter.cacheWriteTokens,
                costUsd: meter.costUsd.toFixed(6),
            },
        });
    } catch (error) {
        console.error("AI usage record failed", error instanceof Error ? error.name : "UnknownError");
    }
}
