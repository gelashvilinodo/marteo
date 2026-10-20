import type {
    PreparedImportCustomer,
} from "./prepare-import-customers";
import type {
    ImportCustomerCheckSnapshot,
    ImportExistingCustomerLinks,
} from "./import-types";

export type CustomerImportPlanItem = {
    record: PreparedImportCustomer;
    action: "CREATE" | "LINK" | "BLOCKED";
    customerId: string | null;
    reason: string;
    reasonCode: "WAITING_FOR_CHECK" | "REQUIRES_ACTION" | null;
};

export function buildCustomerImportPlan({
    records,
    snapshot,
    links,
}: {
    records: readonly PreparedImportCustomer[];
    snapshot: ImportCustomerCheckSnapshot | null;
    links: ImportExistingCustomerLinks;
}): {
    items: CustomerImportPlanItem[];
    createCount: number;
    linkCount: number;
    blockedCount: number;
    checkCurrent: boolean;
} {
    const phones = [
        ...new Set(
            records.flatMap(record =>
                record.status !== "INVALID" && record.data
                    ? [record.data.phone]
                    : [],
            ),
        ),
    ].sort();

    const requestedPhones = snapshot
        ? [...new Set(snapshot.requestedPhones)].sort()
        : [];

    const requestCurrent =
        snapshot !== null &&
        phones.length === requestedPhones.length &&
        phones.every(
            (phone, index) => phone === requestedPhones[index],
        );

    const checkedSet = new Set(snapshot?.checkedPhones ?? []);
    const failedSet = new Set(snapshot?.failedPhones ?? []);

    const checkCurrent =
        requestCurrent &&
        snapshot !== null &&
        snapshot.businessId !== null &&
        failedSet.size === 0 &&
        phones.every(phone => checkedSet.has(phone));

    const items = records.map(
        (record): CustomerImportPlanItem => {
            function blocked(
                reason: string,
                reasonCode: "WAITING_FOR_CHECK" | "REQUIRES_ACTION" =
                    "REQUIRES_ACTION",
            ): CustomerImportPlanItem {
                return {
                    record,
                    action: "BLOCKED",
                    customerId: null,
                    reason,
                    reasonCode,
                };
            }

            if (
                record.status === "INVALID" ||
                !record.data
            ) {
                const errors = record.issues
                    .filter(issue => issue.severity === "ERROR")
                    .map(issue => issue.message);

                return blocked(
                    errors.join(" ") ||
                    "ჩანაწერის სავალდებულო მონაცემები შესასწორებელია.",
                );
            }

            if (record.status === "NEEDS_REVIEW") {
                return blocked(
                    "ეს ნომერი ატვირთულ მონაცემებში მეორდება. შეასწორე არასწორი ნომერი ან გამოტოვე ზედმეტი ჩანაწერი.",
                );
            }

            if (!requestCurrent || !snapshot) {
                return blocked(
                    "არსებულ მომხმარებლებთან შედარება ჯერ დასასრულებელია.",
                    "WAITING_FOR_CHECK",
                );
            }

            const phone = record.data.phone;

            if (failedSet.has(phone)) {
                return blocked(
                    "ამ ნომრის შემოწმება ტექნიკურად ვერ დადასტურდა. ეს მომხმარებლის მონაცემების შეცდომას არ ნიშნავს. ხელახლა შეამოწმე დაუდასტურებელი ნაწილი ან დროებით გამოტოვე ჩანაწერი.",
                );
            }

            if (!checkedSet.has(phone) || snapshot.businessId === null) {
                return blocked(
                    "ამ ნომრის შემოწმება ჯერ არ დასრულებულა.",
                    "WAITING_FOR_CHECK",
                );
            }

            const matches = snapshot.matches.filter(
                match => match.normalizedPhone === phone,
            );

            if (matches.length === 0) {
                return {
                    record,
                    action: "CREATE",
                    reasonCode: null,
                    customerId: null,
                    reason:
                        "ამ ნომრით არსებული მომხმარებელი ვერ მოიძებნა. შეიქმნება ახალი მომხმარებელი.",
                };
            }

            const link = links[phone];

            if (!link) {
                return blocked(
                    "ამ ნომრით MARTEO-ში მომხმარებელი უკვე არსებობს. აირჩიე არსებულთან დაკავშირება ან გამოტოვე იმპორტის ჩანაწერი.",
                );
            }

            const existing = matches.find(
                match => match.id === link.customerId,
            );

            if (
                !existing ||
                link.businessId !== snapshot.businessId ||
                link.normalizedPhone !== phone ||
                link.updatedAt !== existing.updatedAt
            ) {
                return blocked(
                    "ადრე არჩეული კავშირი შემოწმების შედეგს აღარ შეესაბამება. ხელახლა აირჩიე შესაბამისი არსებული მომხმარებელი.",
                );
            }

            if (existing.deletedAt !== null) {
                return blocked(
                    "არჩეული მომხმარებელი ადრე წაშლილია. ამ ეტაპზე ავტომატურად არ აღვადგენთ — გამოტოვე ჩანაწერი ან მომხმარებელი ცალკე აღადგინე.",
                );
            }

            return {
                record,
                action: "LINK",
                reasonCode: null,
                customerId: existing.id,
                reason:
                    "დაუკავშირდება არსებულ მომხმარებელს. MARTEO-ში არსებული სახელი, გვარი და მისამართი შენარჩუნდება.",
            };
        },
    );

    return {
        items,
        createCount: items.filter(
            item => item.action === "CREATE",
        ).length,
        linkCount: items.filter(
            item => item.action === "LINK",
        ).length,
        blockedCount: items.filter(
            item => item.action === "BLOCKED",
        ).length,
        checkCurrent,
    };
}