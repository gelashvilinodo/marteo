import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type ReplyTemplate = { id: string; title: string; body: string; sortOrder: number };
export type AdminNote = { id: string; body: string; createdAt: string; adminName: string | null };

function text(value: unknown, field: string, max: number) {
    if (typeof value !== "string") throw new AdminActionError(`${field} არასწორია.`);
    const trimmed = value.replace(/\r\n/g, "\n").trim();
    if (!trimmed) throw new AdminActionError(`${field} ცარიელია.`);
    if (trimmed.length > max) throw new AdminActionError(`${field} ${max} სიმბოლოს არ უნდა აღემატებოდეს.`);
    return trimmed;
}

function id(value: unknown, message: string) {
    if (typeof value !== "string" || !ID.test(value)) throw new AdminActionError(message, 404);
    return value;
}

export async function listTemplates(prisma: PrismaClient): Promise<ReplyTemplate[]> {
    return prisma.supportReplyTemplate.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, body: true, sortOrder: true },
    });
}

export async function createTemplate(prisma: PrismaClient, input: { title?: unknown; body?: unknown }) {
    const title = text(input.title, "სათაური", 60);
    const body = text(input.body, "ტექსტი", 2000);
    const last = await prisma.supportReplyTemplate.aggregate({ _max: { sortOrder: true } });
    return prisma.supportReplyTemplate.create({
        data: { title, body, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true, title: true, body: true, sortOrder: true },
    });
}

export async function updateTemplate(prisma: PrismaClient, templateId: unknown, input: { title?: unknown; body?: unknown }) {
    const key = id(templateId, "შაბლონი ვერ მოიძებნა.");
    const updated = await prisma.supportReplyTemplate.updateMany({
        where: { id: key },
        data: { title: text(input.title, "სათაური", 60), body: text(input.body, "ტექსტი", 2000) },
    });
    if (!updated.count) throw new AdminActionError("შაბლონი ვერ მოიძებნა.", 404);
}

export async function deleteTemplate(prisma: PrismaClient, templateId: unknown) {
    const deleted = await prisma.supportReplyTemplate.deleteMany({ where: { id: id(templateId, "შაბლონი ვერ მოიძებნა.") } });
    if (!deleted.count) throw new AdminActionError("შაბლონი ვერ მოიძებნა.", 404);
}

export async function listNotes(prisma: PrismaClient, businessId: string): Promise<AdminNote[]> {
    const rows = await prisma.businessAdminNote.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, body: true, createdAt: true, admin: { select: { firstName: true, lastName: true, email: true } } },
    });
    return rows.map(row => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        adminName: row.admin ? [row.admin.firstName, row.admin.lastName].filter(Boolean).join(" ") || row.admin.email : null,
    }));
}

export async function createNote(prisma: PrismaClient, adminId: string, businessId: unknown, body: unknown) {
    const key = id(businessId, "ბიზნესი ვერ მოიძებნა.");
    const business = await prisma.business.findUnique({ where: { id: key }, select: { id: true } });
    if (!business) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
    await prisma.businessAdminNote.create({ data: { businessId: key, adminId, body: text(body, "შენიშვნა", 2000) } });
    return listNotes(prisma, key);
}

export async function deleteNote(prisma: PrismaClient, businessId: unknown, noteId: unknown) {
    const key = id(businessId, "ბიზნესი ვერ მოიძებნა.");
    const deleted = await prisma.businessAdminNote.deleteMany({ where: { id: id(noteId, "შენიშვნა ვერ მოიძებნა."), businessId: key } });
    if (!deleted.count) throw new AdminActionError("შენიშვნა ვერ მოიძებნა.", 404);
    return listNotes(prisma, key);
}
