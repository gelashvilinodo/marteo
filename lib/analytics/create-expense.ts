import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "@/lib/orders/validate-order";
import { expenseCategories } from "./expense-categories";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function text(value: unknown, label: string) {
    if (value === undefined || value === null) return "";

    if (typeof value !== "string") {
        fail(`${label}: მონაცემის ფორმატი არასწორია.`);
    }

    return value.normalize("NFC").trim();
}

export async function createExpense(raw: unknown) {
    const user = await getCurrentUser();

    if (!user) fail("გაიარე ავტორიზაცია.", 401);

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        fail("მონაცემების ფორმატი არასწორია.");
    }

    const body = raw as Record<string, unknown>;
    const requestId = text(body.requestId, "მოთხოვნის კოდი").toLowerCase();

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)
    ) {
        fail("მოთხოვნის კოდი არასწორია.");
    }

    const category = expenseCategories.find(
        item => item.value === body.category,
    )?.value;

    if (!category) fail("აირჩიე ხარჯის კატეგორია.");

    const amountText = text(body.amount, "თანხა").replace(",", ".");

    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) {
        fail("თანხა მიუთითე თეთრების სიზუსტით.");
    }

    const amount = new Prisma.Decimal(amountText);

    if (amount.lte(0)) {
        fail("ხარჯის თანხა ნულზე მეტი უნდა იყოს.");
    }

    // არსებული Decimal(12, 2) სვეტის ტექნიკური დიაპაზონი.
    if (amount.gt("9999999999.99")) {
        fail("თანხა ბაზის თანხის ველში ვერ მოთავსდება.");
    }

    const dateText = text(body.expenseDate, "თარიღი");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        fail("მიუთითე ხარჯის თარიღი.");
    }

    const checkedDate = new Date(`${dateText}T00:00:00.000Z`);

    if (
        !Number.isFinite(checkedDate.getTime()) ||
        checkedDate.toISOString().slice(0, 10) !== dateText
    ) {
        fail("ხარჯის თარიღი არასწორია.");
    }

    const expenseDate = new Date(`${dateText}T00:00:00+04:00`);
    const title = text(body.title, "დასახელება");
    const note = text(body.note, "კომენტარი");

    const prisma = createPrismaClient();

    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: [{ createdAt: "asc" }, { businessId: "asc" }],
            select: { businessId: true },
        });

        if (!membership) fail("ბიზნესი ვერ მოიძებნა.", 403);

        const businessId = membership.businessId;

        return await prisma.$transaction(async tx => {
            await tx.$queryRaw`
                SELECT id FROM "Business"
                WHERE id = ${businessId}
                FOR UPDATE
            `;

            const existing = await tx.expense.findUnique({
                where: { id: requestId },
            });

            if (existing) {
                const same =
                    existing.businessId === businessId &&
                    existing.category === category &&
                    existing.amount.eq(amount) &&
                    existing.expenseDate.getTime() === expenseDate.getTime() &&
                    (existing.title ?? "") === title &&
                    (existing.note ?? "") === note;

                if (!same) {
                    fail(
                        "იგივე მოთხოვნის კოდი განსხვავებულ მონაცემებზეა გამოყენებული.",
                        409,
                    );
                }

                return { id: existing.id };
            }

            return await tx.expense.create({
                data: {
                    id: requestId,
                    businessId,
                    category,
                    amount,
                    expenseDate,
                    title: title || null,
                    note: note || null,
                },
                select: { id: true },
            });
        });
    } finally {
        await prisma.$disconnect();
    }
}