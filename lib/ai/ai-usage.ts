import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readUsagePeriod } from "@/lib/subscription/limits";
import { notifyLimit, queueNoticeChannels } from "@/lib/subscription/notices";
import { PLAN_LIMITS } from "@/lib/subscription/plans";
import { AiChatError, MARTEO_AI_MODEL } from "./anthropic-client";
import { AI_MONTHLY_LIMITS, formatResetDay, type AiQuota } from "./ai-quota";

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

function questionLimit(plan: string, override: number | null) {
    return override ?? AI_MONTHLY_LIMITS[plan as keyof typeof AI_MONTHLY_LIMITS] ?? AI_MONTHLY_LIMITS.FREE;
}

// ლიმიტი გადახდის პერიოდზეა: ახალ პერიოდში (ახალი გადახდა ან გეგმის შეცვლა) ნულდება.
// მხოლოდ მოქმედი გეგმა: დაბლოკილ ბიზნესს (ვადაგასული, გადაუხდელი) AI-ის ლიმიტი 0-ია.
export async function getAiQuota(db: Db, businessId: string, now = new Date()): Promise<AiQuota> {
    const [business, period] = await Promise.all([
        db.business.findUnique({ where: { id: businessId }, select: { aiDisabled: true, aiMonthlyLimit: true } }),
        readUsagePeriod(db, businessId, now),
    ]);
    const plan = period.plan.tier ?? "FREE";
    const limits = period.plan.tier ? PLAN_LIMITS[period.plan.tier] : null;
    const shared = limits?.aiFilesAreQuestions ?? false;
    const since = { gte: period.start };
    const [chats, files] = await Promise.all([
        db.aiUsage.count({ where: { businessId, counted: true, kind: "CHAT", createdAt: since } }),
        db.aiUsage.count({ where: { businessId, counted: true, kind: "PURCHASE_DRAFT", createdAt: since } }),
    ]);
    return {
        plan, disabled: business?.aiDisabled ?? false,
        used: shared ? chats + files : chats,
        limit: questionLimit(plan, business?.aiMonthlyLimit ?? null),
        custom: business?.aiMonthlyLimit != null,
        resetsAt: period.end?.toISOString() ?? null,
        trial: plan === "TRIAL",
        files: { used: files, limit: limits ? limits.aiFiles : 0, shared },
    };
}

export type AiUsageReservation = { id: string; kind: Kind; meter: AiUsageMeter; quota: AiQuota };

function limitMessage(quota: AiQuota, files: boolean) {
    const [used, limit] = files ? [quota.files.used, quota.files.limit ?? 0] : [quota.used, quota.limit];
    const what = files ? "ფაილიდან შესყიდვის" : "AI-ის";
    if (quota.trial) return `საცდელი პერიოდის ${limit} AI კითხვა ამოიწურა. მეტისთვის აირჩიეთ გეგმა.`;
    const reset = quota.resetsAt ? ` ლიმიტი განახლდება ${formatResetDay(quota.resetsAt)}.` : "";
    return `ამ პერიოდის ${what} ლიმიტი ამოიწურა (${used}/${limit}).${reset}`;
}

/**
 * Checks the switch and the plan's limit and books a slot before the model is called,
 * under a business row lock so parallel requests cannot pass the limit together.
 * Questions and purchase files have separate limits, except in the trial where both share the questions.
 */
export async function startAiUsage(prisma: PrismaClient, input: { businessId: string; businessName: string; userId: string | null; kind: Exclude<Kind, "TITLE"> }): Promise<AiUsageReservation> {
    let limitNotice = false;
    const reservation = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${input.businessId} FOR UPDATE`;
        const quota = await getAiQuota(tx, input.businessId);
        if (quota.disabled) throw new AiChatError("მართეო AI ამ ბიზნესისთვის გამორთულია. დაგვიკავშირდით დახმარების ჩათში.", 403);
        const file = input.kind === "PURCHASE_DRAFT" && !quota.files.shared;
        if (file ? quota.files.limit !== null && quota.files.used >= quota.files.limit : quota.used >= quota.limit) {
            throw new AiChatError(limitMessage(quota, file), 429);
        }
        const row = await tx.aiUsage.create({
            data: { businessId: input.businessId, businessName: input.businessName, userId: input.userId, kind: input.kind, model: MARTEO_AI_MODEL, counted: true },
            select: { id: true },
        });
        const next = file
            ? { ...quota, files: { ...quota.files, used: quota.files.used + 1 } }
            : { ...quota, used: quota.used + 1, files: quota.files.shared ? { ...quota.files, used: quota.files.used + (input.kind === "PURCHASE_DRAFT" ? 1 : 0) } : quota.files };
        // 80%/100%: მფლობელებს შეტყობინება (საცდელი ერთი პერიოდია და იგივე წესით ითვლება).
        const period = await readUsagePeriod(tx, input.businessId);
        limitNotice = file
            ? await notifyLimit(tx, { businessId: input.businessId, what: "aiFiles", used: next.files.used, limit: next.files.limit, periodStart: period.start })
            : await notifyLimit(tx, { businessId: input.businessId, what: "ai", used: next.used, limit: next.limit, periodStart: period.start });
        return { id: row.id, kind: input.kind, meter: new AiUsageMeter(), quota: next };
    });
    if (limitNotice) void queueNoticeChannels(input.businessId);
    return reservation;
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
