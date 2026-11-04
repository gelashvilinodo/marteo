import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { getAnthropicClient, MARTEO_AI_MODEL } from "./anthropic-client";
import { AiUsageMeter, recordAiUsage } from "./ai-usage";
import type { AiConversationSummary, StoredAiMessage } from "./ai-conversations-client";

type Client = ReturnType<typeof createPrismaClient>;
type Owner = { businessId: string; userId: string };

export const AI_HISTORY_DAYS = 30;
const MAX_MESSAGES = 200;
const MAX_BYTES = 1_500_000;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AiConversationError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

export function readConversationId(value: string) {
    if (!ID_PATTERN.test(value)) throw new AiConversationError("ჩათი ვერ მოიძებნა.", 404);
    return value.toLowerCase();
}

function cutoff() {
    return new Date(Date.now() - AI_HISTORY_DAYS * 86_400_000);
}

// მხოლოდ ის ველები ინახება, რასაც ჩატი ხელახლა ხატავს. ფაილის შესყიდვის მონახაზი
// და პროგრესის ნაბიჯები დროებითია და ისტორიაში აღარ გადადის.
export function sanitizeMessages(value: unknown): StoredAiMessage[] {
    if (!Array.isArray(value) || value.length > MAX_MESSAGES) {
        throw new AiConversationError("მიმოწერა ზედმეტად დიდია.");
    }

    const messages = value.flatMap((raw): StoredAiMessage[] => {
        const item = (raw ?? {}) as Record<string, unknown>;
        if ((item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string" || typeof item.id !== "string") return [];
        if (item.progress) return [];

        const attachment = item.attachment as { name?: unknown; size?: unknown } | undefined;
        const link = item.link as { href?: unknown; label?: unknown } | undefined;

        return [{
            id: item.id.slice(0, 64),
            role: item.role,
            text: item.text.slice(0, 20_000),
            ...(item.failed === true ? { failed: true } : {}),
            ...(attachment && typeof attachment.name === "string" && typeof attachment.size === "number"
                ? { attachment: { name: attachment.name.slice(0, 200), size: attachment.size } }
                : {}),
            ...(Array.isArray(item.cards) && item.cards.length > 0 ? { cards: item.cards as StoredAiMessage["cards"] } : {}),
            ...(link && typeof link.href === "string" && link.href.startsWith("/") && !link.href.startsWith("//") && typeof link.label === "string"
                ? { link: { href: link.href.slice(0, 300), label: link.label.slice(0, 100) } }
                : {}),
        }];
    });

    if (new TextEncoder().encode(JSON.stringify(messages)).byteLength > MAX_BYTES) {
        throw new AiConversationError("მიმოწერა ზედმეტად დიდია.");
    }

    return messages;
}

export async function listConversations(prisma: Client, owner: Owner): Promise<AiConversationSummary[]> {
    // 30 დღეზე ძველი ჩათები ყველასთვის იშლება; ინდექსით ეს იაფია.
    await prisma.aiConversation.deleteMany({ where: { updatedAt: { lt: cutoff() } } });

    const rows = await prisma.$queryRaw<Array<{ id: string; title: string | null; updatedAt: Date; preview: string | null }>>`
        SELECT id, title, "updatedAt",
            (SELECT left(m->>'text', 120) FROM jsonb_array_elements(messages) m WHERE m->>'role' = 'user' LIMIT 1) AS preview
        FROM "AiConversation"
        WHERE "businessId" = ${owner.businessId} AND "userId" = ${owner.userId} AND "updatedAt" >= ${cutoff()}
        ORDER BY "updatedAt" DESC
        LIMIT 100
    `;

    return rows.map((row) => ({ id: row.id, title: row.title, preview: row.preview, updatedAt: row.updatedAt.toISOString() }));
}

export async function getConversation(prisma: Client, owner: Owner, id: string) {
    const row = await prisma.aiConversation.findFirst({
        where: { id, ...owner, updatedAt: { gte: cutoff() } },
        select: { id: true, title: true, messages: true, updatedAt: true },
    });

    if (!row) throw new AiConversationError("ჩათი ვერ მოიძებნა.", 404);
    return { ...row, messages: row.messages as unknown as StoredAiMessage[], updatedAt: row.updatedAt.toISOString() };
}

// ჩათის id ბრაუზერში იქმნება; სხვისი id-ით ჩაწერა 404-ს აბრუნებს.
export async function saveConversation(prisma: Client, owner: Owner, id: string, messages: StoredAiMessage[], title: string | null) {
    const existing = await prisma.aiConversation.findUnique({ where: { id }, select: { businessId: true, userId: true, title: true } });

    if (existing && (existing.businessId !== owner.businessId || existing.userId !== owner.userId)) {
        throw new AiConversationError("ჩათი ვერ მოიძებნა.", 404);
    }

    const data = messages as unknown as Prisma.InputJsonValue;
    const saved = existing
        ? await prisma.aiConversation.update({
            where: { id },
            data: { messages: data, ...(existing.title === null && title ? { title } : {}) },
            select: { title: true, updatedAt: true },
        })
        : await prisma.aiConversation.create({
            data: { id, ...owner, messages: data, title },
            select: { title: true, updatedAt: true },
        });

    return { title: saved.title, updatedAt: saved.updatedAt.toISOString() };
}

export async function deleteConversation(prisma: Client, owner: Owner, id: string) {
    const result = await prisma.aiConversation.deleteMany({ where: { id, ...owner } });
    if (result.count === 0) throw new AiConversationError("ჩათი ვერ მოიძებნა.", 404);
}

function fallbackTitle(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 40 ? `${clean.slice(0, 40).trimEnd()}…` : clean || "ახალი ჩათი";
}

// სათაურს AI წერს პირველი კითხვისა და პასუხის მიხედვით; შეცდომისას კითხვის დასაწყისი რჩება.
export async function ensureConversationTitle(prisma: Client, owner: Owner, id: string) {
    const conversation = await getConversation(prisma, owner, id);
    if (conversation.title) return conversation.title;

    const question = conversation.messages.find((message) => message.role === "user")?.text ?? "";
    const answer = conversation.messages.find((message) => message.role === "assistant" && !message.failed)?.text ?? "";
    if (!question) return null;

    let title = fallbackTitle(question);
    const meter = new AiUsageMeter();

    try {
        const response = await getAnthropicClient().messages.create({
            model: MARTEO_AI_MODEL,
            max_tokens: 40,
            system: "Write a short Georgian title (2 to 5 words) for this chat in a business app. Reply with the title only: no quotes, no period, no emoji.",
            messages: [{ role: "user", content: `Question: ${question.slice(0, 500)}\nAnswer: ${answer.slice(0, 500)}` }],
        });
        meter.add(response.usage);
        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join(" ")
            .replace(/["«»„“”]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (text) title = text.slice(0, 80);
    } catch (error) {
        console.error("Marteo AI title failed", error instanceof Error ? error.name : "UnknownError");
    }
    await recordAiUsage(prisma, { businessId: owner.businessId, userId: owner.userId, kind: "TITLE", meter });

    await prisma.aiConversation.updateMany({ where: { id, ...owner, title: null }, data: { title } });
    return title;
}
