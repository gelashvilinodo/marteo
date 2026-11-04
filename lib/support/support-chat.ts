import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
    SUPPORT_MESSAGE_LIFETIME_MS,
    SUPPORT_IMAGE_LABEL,
    SUPPORT_MESSAGE_MAX_LENGTH,
    type SupportMessageView,
    type SupportThreadView,
} from "./support-config";
import { removeSupportImages, uploadSupportImage, type SupportImage } from "./support-images";

export class SupportError extends Error {
    constructor(message: string, public status = 422) {
        super(message);
        this.name = "SupportError";
    }
}

const MESSAGE_LIMIT = 300;

const messageSelect = {
    id: true,
    sender: true,
    body: true,
    imagePath: true,
    createdAt: true,
    senderUser: { select: { firstName: true, lastName: true, email: true, avatarUrl: true } },
} as const;

type MessageRecord = {
    id: string;
    sender: "USER" | "ADMIN";
    body: string;
    imagePath: string | null;
    createdAt: Date;
    senderUser: { firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null } | null;
};

export function supportCutoff(now = Date.now()) {
    return new Date(now - SUPPORT_MESSAGE_LIFETIME_MS);
}

// Messages live for 24 hours. Every read and write sweeps expired rows, so
// nothing older is ever served even without a scheduled job. Photos are
// removed from storage first; if that fails, their rows wait for the next sweep
// so no file is left without a message pointing at it.
export async function purgeExpiredSupportMessages(prisma: PrismaClient) {
    const cutoff = supportCutoff();
    const withImages = await prisma.supportMessage.findMany({
        where: { createdAt: { lt: cutoff }, imagePath: { not: null } },
        select: { id: true, imagePath: true },
        take: 500,
    });
    let kept: string[] = [];
    try {
        await removeSupportImages(withImages.map(message => message.imagePath!));
    } catch {
        console.error("Support image cleanup failed");
        kept = withImages.map(message => message.id);
    }
    await prisma.supportMessage.deleteMany({ where: { createdAt: { lt: cutoff }, id: { notIn: kept } } });
}

// A photo may be sent without text.
export function readSupportText(body: unknown, allowEmpty = false) {
    const text = body && typeof body === "object" ? (body as { text?: unknown }).text : undefined;
    if (allowEmpty && (text === undefined || text === null)) return "";
    if (typeof text !== "string") throw new SupportError("შეტყობინება არასწორია.");
    const value = text.replace(/\r\n/g, "\n").trim();
    if (!value && !allowEmpty) throw new SupportError("შეტყობინება ცარიელია.");
    if (value.length > SUPPORT_MESSAGE_MAX_LENGTH) {
        throw new SupportError(`შეტყობინება ${SUPPORT_MESSAGE_MAX_LENGTH} სიმბოლოს არ უნდა აღემატებოდეს.`);
    }
    return value;
}

export function displayName(user: { firstName: string | null; lastName: string | null; email: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

// `imageBase` is the viewer's image route; each side checks its own access.
export type ImageBase = "/api/support/images" | "/api/admin/support/images";

function serializeMessage(message: MessageRecord, imageBase: ImageBase): SupportMessageView {
    return {
        id: message.id,
        sender: message.sender,
        body: message.body,
        imageUrl: message.imagePath ? `${imageBase}/${message.id}` : null,
        createdAt: message.createdAt.toISOString(),
        author: message.senderUser
            ? { name: displayName(message.senderUser), avatarUrl: message.senderUser.avatarUrl }
            : null,
    };
}

async function readThread(prisma: PrismaClient, where: Prisma.SupportConversationWhereUniqueInput, imageBase: ImageBase): Promise<SupportThreadView | null> {
    const conversation = await prisma.supportConversation.findUnique({
        where,
        select: {
            id: true, status: true, adminReadAt: true, userReadAt: true,
            messages: {
                where: { createdAt: { gte: supportCutoff() } },
                orderBy: { createdAt: "desc" },
                take: MESSAGE_LIMIT,
                select: messageSelect,
            },
        },
    });
    if (!conversation) return null;
    return {
        conversationId: conversation.id,
        status: conversation.status,
        adminReadAt: conversation.adminReadAt?.toISOString() ?? null,
        userReadAt: conversation.userReadAt?.toISOString() ?? null,
        messages: conversation.messages.reverse().map(message => serializeMessage(message, imageBase)),
    };
}

const emptyThread: SupportThreadView = { conversationId: null, status: "OPEN", adminReadAt: null, userReadAt: null, messages: [] };

export async function getBusinessThread(prisma: PrismaClient, businessId: string) {
    await purgeExpiredSupportMessages(prisma);
    await prisma.supportConversation.updateMany({ where: { businessId }, data: { userReadAt: new Date() } });
    return await readThread(prisma, { businessId }, "/api/support/images") ?? emptyThread;
}

// Uploads before the row exists, so the other side never sees a missing photo.
async function storeImage(conversationId: string, image: SupportImage | null) {
    return image ? uploadSupportImage(conversationId, image) : null;
}

async function createMessage(prisma: PrismaClient, data: Prisma.SupportMessageUncheckedCreateInput) {
    try {
        await prisma.supportMessage.create({ data });
    } catch (cause) {
        if (data.imagePath) await removeSupportImages([data.imagePath]).catch(() => undefined);
        throw cause;
    }
}

export async function postBusinessMessage(prisma: PrismaClient, businessId: string, userId: string, text: string, image: SupportImage | null = null) {
    await purgeExpiredSupportMessages(prisma);
    const now = new Date();
    // A new message reopens a closed conversation for the admin.
    const conversation = await prisma.supportConversation.upsert({
        where: { businessId },
        create: { businessId, lastMessageAt: now, userReadAt: now },
        update: { status: "OPEN", lastMessageAt: now, userReadAt: now },
        select: { id: true, business: { select: { name: true } } },
    });
    const imagePath = await storeImage(conversation.id, image);
    await createMessage(prisma, { conversationId: conversation.id, sender: "USER", senderUserId: userId, body: text, imagePath, createdAt: now });
    return { conversationId: conversation.id, businessName: conversation.business.name, thread: (await readThread(prisma, { businessId }, "/api/support/images"))! };
}

export async function getAdminThread(prisma: PrismaClient, conversationId: string) {
    await purgeExpiredSupportMessages(prisma);
    const updated = await prisma.supportConversation.updateMany({ where: { id: conversationId }, data: { adminReadAt: new Date() } });
    if (!updated.count) throw new SupportError("მიმოწერა ვერ მოიძებნა.", 404);
    return (await readThread(prisma, { id: conversationId }, "/api/admin/support/images"))!;
}

export async function postAdminMessage(prisma: PrismaClient, conversationId: string, adminId: string, text: string, image: SupportImage | null = null) {
    await purgeExpiredSupportMessages(prisma);
    const now = new Date();
    const updated = await prisma.supportConversation.updateMany({
        where: { id: conversationId },
        data: { lastMessageAt: now, adminReadAt: now },
    });
    if (!updated.count) throw new SupportError("მიმოწერა ვერ მოიძებნა.", 404);
    const imagePath = await storeImage(conversationId, image);
    await createMessage(prisma, { conversationId, sender: "ADMIN", senderUserId: adminId, body: text, imagePath, createdAt: now });
    return (await readThread(prisma, { id: conversationId }, "/api/admin/support/images"))!;
}

// Lets the admin start a conversation a business has not opened yet.
export async function ensureConversation(prisma: PrismaClient, businessId: unknown) {
    if (typeof businessId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(businessId)) throw new SupportError("ბიზნესი ვერ მოიძებნა.", 404);
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
    if (!business) throw new SupportError("ბიზნესი ვერ მოიძებნა.", 404);
    const conversation = await prisma.supportConversation.upsert({
        where: { businessId }, create: { businessId }, update: {}, select: { id: true },
    });
    return conversation.id;
}

export async function setConversationStatus(prisma: PrismaClient, conversationId: string, status: unknown) {
    if (status !== "OPEN" && status !== "CLOSED") throw new SupportError("სტატუსი არასწორია.");
    const updated = await prisma.supportConversation.updateMany({ where: { id: conversationId }, data: { status } });
    if (!updated.count) throw new SupportError("მიმოწერა ვერ მოიძებნა.", 404);
    return status;
}

export type AdminConversationRow = {
    id: string;
    status: "OPEN" | "CLOSED";
    lastMessageAt: string;
    unread: number;
    business: { id: string; name: string; logoUrl: string | null };
    lastMessage: { sender: "USER" | "ADMIN"; body: string } | null;
};

// Only conversations that still hold unexpired messages are listed.
export async function listAdminConversations(prisma: PrismaClient): Promise<{ conversations: AdminConversationRow[]; unreadTotal: number }> {
    await purgeExpiredSupportMessages(prisma);
    const cutoff = supportCutoff();
    const rows = await prisma.supportConversation.findMany({
        where: { messages: { some: { createdAt: { gte: cutoff } } } },
        orderBy: { lastMessageAt: "desc" },
        take: 200,
        select: {
            id: true, status: true, lastMessageAt: true, adminReadAt: true,
            business: { select: { id: true, name: true, logoUrl: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { sender: true, body: true, imagePath: true } },
        },
    });
    const unread = await Promise.all(rows.map(row => prisma.supportMessage.count({
        where: { conversationId: row.id, sender: "USER", createdAt: { gt: row.adminReadAt ?? cutoff } },
    })));
    const conversations = rows.map((row, index) => ({
        id: row.id,
        status: row.status,
        lastMessageAt: row.lastMessageAt.toISOString(),
        unread: unread[index],
        business: row.business,
        lastMessage: row.messages[0]
            ? { sender: row.messages[0].sender, body: row.messages[0].body || (row.messages[0].imagePath ? SUPPORT_IMAGE_LABEL : "") }
            : null,
    }));
    return { conversations, unreadTotal: conversations.reduce((sum, row) => sum + row.unread, 0) };
}

export async function countAdminUnread(prisma: PrismaClient) {
    const [row] = await prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM "SupportMessage" m
        JOIN "SupportConversation" c ON c.id = m."conversationId"
        WHERE m.sender = 'USER' AND m."createdAt" >= ${supportCutoff()}
          AND (c."adminReadAt" IS NULL OR m."createdAt" > c."adminReadAt")
    `;
    return row?.total ?? 0;
}

// Replies the business has not opened yet; the help page marks them read.
export async function countBusinessUnread(prisma: PrismaClient, businessId: string) {
    const conversation = await prisma.supportConversation.findUnique({ where: { businessId }, select: { id: true, userReadAt: true } });
    if (!conversation) return 0;
    const cutoff = supportCutoff();
    const since = conversation.userReadAt && conversation.userReadAt > cutoff ? conversation.userReadAt : cutoff;
    return prisma.supportMessage.count({ where: { conversationId: conversation.id, sender: "ADMIN", createdAt: { gt: since } } });
}

export async function getConversationBusinessProfile(prisma: PrismaClient, conversationId: string) {
    const conversation = await prisma.supportConversation.findUnique({
        where: { id: conversationId },
        select: {
            id: true, status: true, createdAt: true,
            business: {
                select: {
                    id: true, name: true, logoUrl: true, mode: true, category: true,
                    phone: true, email: true, address: true, website: true, description: true, createdAt: true,
                    subscription: { select: { plan: true, status: true, expiresAt: true } },
                    memberships: {
                        orderBy: { createdAt: "asc" },
                        select: {
                            role: true,
                            user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, createdAt: true } },
                        },
                    },
                    _count: { select: { orders: { where: { deletedAt: null } }, customers: true, products: true } },
                },
            },
        },
    });
    if (!conversation) return null;
    const lastOrder = await prisma.order.findFirst({
        where: { businessId: conversation.business.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    return { ...conversation, lastOrderAt: lastOrder?.createdAt ?? null };
}

// Looks up a photo only while its message is still live.
export async function findSupportImage(prisma: PrismaClient, messageId: string) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(messageId)) return null;
    const message = await prisma.supportMessage.findFirst({
        where: { id: messageId, imagePath: { not: null }, createdAt: { gte: supportCutoff() } },
        select: { imagePath: true, conversation: { select: { businessId: true } } },
    });
    return message ? { path: message.imagePath!, businessId: message.conversation.businessId } : null;
}
