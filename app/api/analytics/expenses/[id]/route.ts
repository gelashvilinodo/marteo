import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { expenseCategories } from "@/lib/analytics/expense-categories";
import { OrderValidationError } from "@/lib/orders/validate-order";
import {
    readOrderBody,
    orderJson,
    orderError,
} from "@/lib/orders/order-http";

type Context = {
    params: Promise<{ id: string }>;
};

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function bodyRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail("მონაცემების ფორმატი არასწორია.");
    }

    return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
    if (value === undefined || value === null) return "";

    if (typeof value !== "string") {
        fail(`${label}: მონაცემის ფორმატი არასწორია.`);
    }

    return value.normalize("NFC").trim();
}

function expectedVersion(body: Record<string, unknown>): Date {
    const value = text(body.updatedAt, "ჩანაწერის ვერსია");
    const date = new Date(value);

    if (!value || !Number.isFinite(date.getTime())) {
        fail("ჩანაწერის ვერსია არასწორია. გახსენი ხარჯი ხელახლა.");
    }

    return date;
}

function validateEdit(body: Record<string, unknown>) {
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

    return {
        category,
        amount,
        expenseDate: new Date(`${dateText}T00:00:00+04:00`),
        title: text(body.title, "დასახელება") || null,
        note: text(body.note, "კომენტარი") || null,
    };
}

async function mutate(
    request: Request,
    context: Context,
    action: "edit" | "delete",
) {
    try {
        if (!(await getCurrentUser())) {
            fail("გაიარე ავტორიზაცია.", 401);
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            fail("ბიზნესი ვერ მოიძებნა.", 403);
        }

        const { id } = await context.params;
        const body = bodyRecord(await readOrderBody(request));
        const expected = expectedVersion(body);
        const edit = action === "edit" ? validateEdit(body) : null;

        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(async tx => {
                await tx.$queryRaw`
                    SELECT id
                    FROM "Business"
                    WHERE id = ${membership.businessId}
                    FOR UPDATE
                `;

                const existing = await tx.expense.findFirst({
                    where: {
                        id,
                        businessId: membership.businessId,
                    },
                    select: {
                        id: true,
                        category: true,
                        amount: true,
                        expenseDate: true,
                        title: true,
                        note: true,
                        updatedAt: true,
                    },
                });

                if (!existing) {
                    // წარმატებული წაშლის განმეორებითი მოთხოვნა.
                    if (action === "delete") {
                        return { id, deleted: true };
                    }

                    fail("ხარჯი ვერ მოიძებნა.", 404);
                }

                if (action === "edit" && edit) {
                    const sameValues =
                        existing.category === edit.category &&
                        existing.amount.eq(edit.amount) &&
                        existing.expenseDate.getTime() ===
                            edit.expenseDate.getTime() &&
                        existing.title === edit.title &&
                        existing.note === edit.note;

                    // უკვე შენახული მონაცემების განმეორებითი გაგზავნა.
                    if (sameValues) {
                        return {
                            id,
                            updatedAt: existing.updatedAt.toISOString(),
                        };
                    }
                }

                if (existing.updatedAt.getTime() !== expected.getTime()) {
                    fail(
                        "ხარჯი უკვე შეიცვალა. დახურე ფანჯარა და გახსენი ხელახლა.",
                        409,
                    );
                }

                if (action === "delete") {
                    await tx.expense.delete({
                        where: { id: existing.id },
                    });

                    return { id, deleted: true };
                }

                if (!edit) fail("მონაცემები ვერ დამუშავდა.");

                const updated = await tx.expense.update({
                    where: { id: existing.id },
                    data: {
                        ...edit,
                        updatedAt: new Date(
                            Math.max(
                                Date.now(),
                                existing.updatedAt.getTime() + 1,
                            ),
                        ),
                    },
                    select: {
                        id: true,
                        updatedAt: true,
                    },
                });

                return {
                    id: updated.id,
                    updatedAt: updated.updatedAt.toISOString(),
                };
            });

            return orderJson({
                success: true,
                expense: result,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        return orderError(cause);
    }
}

export async function PATCH(request: Request, context: Context) {
    return mutate(request, context, "edit");
}

export async function DELETE(request: Request, context: Context) {
    return mutate(request, context, "delete");
}