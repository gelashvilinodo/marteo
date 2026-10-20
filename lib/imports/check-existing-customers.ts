import "server-only";

import { Prisma } from "@/generated/prisma/client";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

import type {
    ImportExistingCustomerMatch,
} from "./import-types";

type CustomerRow = {
    id: string;
    phone: string;
    normalizedPhone: string;
    firstName: string | null;
    lastName: string | null;
    address: string | null;
    deletedAt: Date | null;
    updatedAt: Date;
};

// ავტორიზაცია და ბიზნესზე წვდომა გამომძახებელმა უნდა შეამოწმოს.
export async function checkExistingCustomers({
    prisma,
    businessId,
    phones,
}: {
    prisma: Pick<Prisma.TransactionClient, "$queryRaw">;
    businessId: string;
    phones: readonly string[];
}) {
    if (
        !businessId ||
        phones.length > 500 ||
        phones.some(
            phone => !/^\+[1-9]\d{7,14}$/.test(phone),
        )
    ) {
        throw new OrderValidationError(
            "ერთ შემოწმებაში დასაშვებია მაქსიმუმ 500 სწორად მომზადებული ტელეფონი.",
            422,
        );
    }

    const checkedPhones = [...new Set(phones)];

    if (checkedPhones.length === 0) {
        return {
            businessId,
            checkedPhones,
            matches: [] as ImportExistingCustomerMatch[],
        };
    }

    const digits = checkedPhones.map(phone => phone.slice(1));

    const rows = await prisma.$queryRaw<CustomerRow[]>(
        Prisma.sql`
            WITH normalized AS (
                SELECT
                    "id",
                    "phone",
                    "firstName",
                    "lastName",
                    "address",
                    "deletedAt",
                    "updatedAt",
                    regexp_replace(
                        regexp_replace(
                            "phone",
                            '[^0-9]',
                            '',
                            'g'
                        ),
                        '^00',
                        ''
                    ) AS digits
                FROM "Customer"
                WHERE "businessId" = ${businessId}
            ),
            canonical AS (
                SELECT
                    *,
                    CASE
                        WHEN length(digits) = 9
                            AND left(digits, 1) = '5'
                        THEN '995' || digits
                        ELSE digits
                    END AS normalized_digits
                FROM normalized
            )
            SELECT
                "id",
                "phone",
                '+' || normalized_digits AS "normalizedPhone",
                "firstName",
                "lastName",
                "address",
                "deletedAt",
                "updatedAt"
            FROM canonical
            WHERE normalized_digits IN (
                ${Prisma.join(digits)}
            )
            ORDER BY
                normalized_digits ASC,
                ("deletedAt" IS NULL) DESC,
                "id" ASC
            LIMIT 10001
        `,
    );

    if (rows.length > 10_000) {
        throw new OrderValidationError(
            "ამ ნომრებისთვის ზედმეტად ბევრი არსებული ჩანაწერი მოიძებნა. შემოწმება სრულად ვერ დადასტურდა; შედეგებს ნაწილობრივ დამთხვევად არ გამოვიყენებთ.",
            422,
        );
    }

    const requested = new Set(checkedPhones);

    const matches: ImportExistingCustomerMatch[] = rows.map(
        row => {
            if (!requested.has(row.normalizedPhone)) {
                throw new Error(
                    "Customer check returned an unrelated phone",
                );
            }

            return {
                id: row.id,
                phone: row.phone,
                normalizedPhone: row.normalizedPhone,
                firstName: row.firstName,
                lastName: row.lastName,
                address: row.address,
                deletedAt: row.deletedAt?.toISOString() ?? null,
                updatedAt: row.updatedAt.toISOString(),
            };
        },
    );

    return {
        businessId,
        checkedPhones,
        matches,
    };
}