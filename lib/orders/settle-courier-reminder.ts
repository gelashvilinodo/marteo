import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "./order-validation-error";
import {
    getCourierReminder,
    type CourierReminder,
} from "./get-courier-reminder";

function object(value: unknown): Record<string, unknown> {
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new OrderValidationError(
            "დადასტურების მონაცემები არასწორია.",
            422,
        );
    }

    return value as Record<string, unknown>;
}

function matchesReminder(
    expected: Record<string, unknown>,
    current: CourierReminder,
): boolean {
    const balance = object(expected.balance);

    const fields = [
        "enabled",
        "startDate",
        "orderCount",
        "unresolvedOrderCount",
        "canSettle",
    ] as const;

    const balanceFields = [
        "courierFees",
        "cashReceived",
        "paidToCourier",
        "receivedFromCourier",
        "signedBalance",
        "amount",
        "direction",
    ] as const;

    return (
        fields.every(
            field => expected[field] === current[field],
        ) &&
        balanceFields.every(
            field => balance[field] === current.balance[field],
        )
    );
}

// გამოიძახე მხოლოდ prisma.$transaction-ის შიგნით.
export async function settleCourierReminder(
    tx: Prisma.TransactionClient,
    input: {
        businessId: string;
        userId: string;
        clientRequestId: unknown;
        confirmed: unknown;
        expectedReminder: unknown;
    },
) {
    if (input.confirmed !== true) {
        throw new OrderValidationError(
            "დაადასტურე საკურიეროსთან თანხის გასწორება.",
            422,
        );
    }

    if (
        typeof input.clientRequestId !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
            input.clientRequestId,
        )
    ) {
        throw new OrderValidationError(
            "მოთხოვნის კოდი არასწორია.",
            422,
        );
    }

    const expected = object(input.expectedReminder);
    const expectedBalance = object(expected.balance);

    const [business] = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
        SELECT id
        FROM "Business"
        WHERE id = ${input.businessId}
        FOR UPDATE
    `);

    if (!business) {
        throw new OrderValidationError(
            "ბიზნესი ვერ მოიძებნა.",
            404,
        );
    }

    const access = await tx.businessMembership.findUnique({
        where: {
            userId_businessId: {
                userId: input.userId,
                businessId: input.businessId,
            },
        },
        select: {
            role: true,
        },
    });

    if (
        !access ||
        !["OWNER", "ADMIN"].includes(access.role)
    ) {
        throw new OrderValidationError(
            "ამ მოქმედებისთვის შესაბამისი უფლება არ გაქვს.",
            403,
        );
    }

    const previous = await tx.courierSettlement.findUnique({
        where: {
            businessId_clientRequestId: {
                businessId: input.businessId,
                clientRequestId: input.clientRequestId,
            },
        },
    });

    if (previous) {
        if (
            previous.amount.toFixed(2) !==
            expectedBalance.signedBalance
        ) {
            throw new OrderValidationError(
                "ეს მოთხოვნის კოდი უკვე სხვა თანხისთვის გამოიყენე.",
                409,
            );
        }

        return {
            replayed: true,
            settlement: {
                id: previous.id,
                amount: previous.amount.toFixed(2),
                createdAt: previous.createdAt.toISOString(),
            },
            reminder: await getCourierReminder(
                tx,
                input.businessId,
            ),
        };
    }

    const current = await getCourierReminder(
        tx,
        input.businessId,
    );

    if (!matchesReminder(expected, current)) {
        throw new OrderValidationError(
            "საკურიეროსთან გასასწორებელი მონაცემები შეიცვალა. განაახლე ბლოკი და თანხა თავიდან გადაამოწმე.",
            409,
        );
    }

    if (!current.enabled) {
        throw new OrderValidationError(
            "ჯერ ჩართე საკურიეროს შეხსენება.",
            422,
        );
    }

    if (current.unresolvedOrderCount > 0) {
        throw new OrderValidationError(
            "ზოგიერთ შეკვეთაზე გადახდის მონაცემები დაუზუსტებელია. ჯერ გადაამოწმე ისინი.",
            422,
        );
    }

    if (!current.canSettle) {
        throw new OrderValidationError(
            "საკურიეროსთან გასასწორებელი თანხა არ არის.",
            422,
        );
    }

    const amount = new Prisma.Decimal(
        current.balance.signedBalance,
    );

    if (amount.abs().greaterThan("999999999999.99")) {
        throw new OrderValidationError(
            "გასასწორებელი თანხა დასაშვებ ზღვარს აღემატება.",
            422,
        );
    }

    const saved = await tx.courierSettlement.create({
        data: {
            businessId: input.businessId,
            clientRequestId: input.clientRequestId,
            amount,
        },
    });

    return {
        replayed: false,
        settlement: {
            id: saved.id,
            amount: saved.amount.toFixed(2),
            createdAt: saved.createdAt.toISOString(),
        },
        reminder: await getCourierReminder(
            tx,
            input.businessId,
        ),
    };
}