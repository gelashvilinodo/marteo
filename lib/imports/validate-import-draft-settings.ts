import type {
    ImportCustomerEdits,
    ImportCustomerMapping,
    ImportExistingCustomerLinks,
} from "./import-types";
import {
    ImportDraftFileError,
} from "./validate-import-draft-file";
import {
    validateProductImportMapping,
    validateProductImportEdits,
    type ProductImportMapping,
    type ProductImportEdits,
} from "./product-import-mapping";
import {
    validateImportRecordKeys,
} from "./validate-import-record-keys";
import {
    validateExistingProductLinks,
    type ImportExistingProductLinks,
} from "./product-import-links";
import type {
    ProductDuplicateDecision,
} from "./resolve-import-product-duplicates";
import {
    validateProductDuplicateDecisions,
} from "./validate-product-duplicate-decisions";
import {
    validateProductStockPolicy,
    type ProductStockPolicy,
} from "./product-stock-policy";
import {
    validateProductStockDate,
} from "./product-stock-date";
import {
    validateProductPhotoDecisions,
    type ProductPhotoDecision,
} from "./product-photo-decisions";
import {
    validateOrderImportMapping,
    validateOrderImportEdits,
    type OrderImportMapping,
    type OrderImportEdits,
} from "./order-import-mapping";
import {
    createOrderImportOptions,
    validateOrderImportOptions,
    type OrderImportOptions,
} from "./order-import-options";
import {
    validateOrderGroupingConfirmations,
} from "./order-grouping-confirmations";
import {
    validateOrderCustomerDecisions,
    type OrderCustomerDecisions,
} from "./order-customer-decisions";

export type ImportDraftSettings = {
    workspaceVersion: 1;
    orderMappings?: Record<string, Record<string, OrderImportMapping>>;
    orderEdits?: Record<string, Record<string, OrderImportEdits>>;
    orderOptions?: OrderImportOptions;
    orderCustomerDecisions?: OrderCustomerDecisions;
    skipOrderCustomers?: boolean;
    excludedOrderKeys?: string[];
    orderGroupingConfirmations?: string[];
    productPhotoDecisions?: ProductPhotoDecision[];
    productDuplicateDecisions: ProductDuplicateDecision[];
    productStockPolicy: ProductStockPolicy | null;
    productStockDate: string | null;
    existingProductLinks: ImportExistingProductLinks;
    productEdits: Record<string, Record<string, ProductImportEdits>>;
    productMappings: Record<string, Record<string, ProductImportMapping>>;
    customerMappings: Record<
        string,
        Record<string, ImportCustomerMapping>
    >;
    customerEdits: Record<
        string,
        Record<string, ImportCustomerEdits>
    >;
    excludedCustomerKeys: string[];
    excludedProductKeys: string[];
    existingCustomerLinks: ImportExistingCustomerLinks;
};

const fields = [
    "phone",
    "address",
    "firstName",
    "lastName",
    "sourceCode",
] as const;

type Field = typeof fields[number];

function fail(path: string, message: string): never {
    throw new ImportDraftFileError(`${path}: ${message}`);
}

function object(
    value: unknown,
    path: string,
): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail(path, "სამუშაო პარამეტრების ფორმატი არასწორია.");
    }

    return value as Record<string, unknown>;
}

function mapRecord<T>(
    value: unknown,
    path: string,
    read: (item: unknown, key: string, path: string) => T,
): Record<string, T> {
    return Object.fromEntries(
        Object.entries(object(value, path)).map(([key, item]) => [
            key,
            read(item, key, `${path} / ${key}`),
        ]),
    );
}

function positiveInteger(value: unknown, path: string): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 1
    ) {
        fail(path, "მოსალოდნელია დადებითი მთელი რიცხვი.");
    }

    return value;
}

function requiredText(value: unknown, path: string): string {
    if (typeof value !== "string" || !value.trim()) {
        fail(path, "მოსალოდნელია არაცარიელი ტექსტი.");
    }

    return value;
}

function fieldName(key: string, path: string): Field {
    const field = fields.find(item => item === key);

    if (!field) fail(path, "მომხმარებლის ველი უცნობია.");

    return field;
}

function fileId(key: string, path: string): void {
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            key,
        )
    ) {
        fail(path, "ფაილის სამუშაო იდენტიფიკატორი არასწორია.");
    }
}

export function validateImportDraftSettings(
    value: unknown,
    businessId: string,
): ImportDraftSettings {
    const input = object(value, "მონახაზის პარამეტრები");
    if (input.skipOrderCustomers !== undefined && typeof input.skipOrderCustomers !== "boolean") {
        fail("მომხმარებლების გამოტოვება", "არჩევანის მნიშვნელობა არასწორია.");
    }
    const productStockDate = validateProductStockDate(
        input.productStockDate,
    );
    const productStockPolicy = validateProductStockPolicy(
        input.productStockPolicy,
    );

    if (input.workspaceVersion !== 1) {
        fail(
            "მონახაზის პარამეტრები",
            "სამუშაო ფორმატის ვერსია მხარდაჭერილი არ არის.",
        );
    }

    const productDuplicateDecisions =
        validateProductDuplicateDecisions(
            input.productDuplicateDecisions,
        );

    const productPhotoDecisions =
        validateProductPhotoDecisions(
            input.productPhotoDecisions,
        );

    const orderMappings = mapRecord(
        input.orderMappings === undefined ? {} : input.orderMappings,
        "შეკვეთების სვეტების არჩევანი",
        (rawFile, key, path) => {
            fileId(key, path);

            return mapRecord(
                rawFile,
                path,
                (rawMapping, sheetName, sheetPath) => {
                    if (!sheetName.trim()) {
                        fail(sheetPath, "ფურცლის სახელი ცარიელია.");
                    }

                    return validateOrderImportMapping(rawMapping);
                },
            );
        },
    );

    const orderEdits = mapRecord(
        input.orderEdits === undefined ? {} : input.orderEdits,
        "შეკვეთების შესწორებები",
        (rawFile, key, path) => {
            fileId(key, path);

            return mapRecord(
                rawFile,
                path,
                (rawEdits, sheetName, sheetPath) => {
                    if (!sheetName.trim()) {
                        fail(sheetPath, "ფურცლის სახელი ცარიელია.");
                    }

                    return validateOrderImportEdits(rawEdits);
                },
            );
        },
    );

    const orderGroupingConfirmations =
        validateOrderGroupingConfirmations(
            input.orderGroupingConfirmations,
        );

    const orderCustomerDecisions =
        validateOrderCustomerDecisions(
            input.orderCustomerDecisions,
            businessId,
        );


    const orderOptions = input.orderOptions === undefined
        ? createOrderImportOptions()
        : validateOrderImportOptions(input.orderOptions);

    const excludedOrderKeys = validateImportRecordKeys(
        input.excludedOrderKeys === undefined
            ? []
            : input.excludedOrderKeys,
        "გამოტოვებული შეკვეთის რიგები",
    );


    const productEdits = mapRecord(
        input.productEdits === undefined ? {} : input.productEdits,
        "პროდუქტების შესწორებები",
        (rawFile, key, path) => {
            fileId(key, path);

            return mapRecord(rawFile, path, (rawSheet, sheetName, sheetPath) => {
                if (!sheetName.trim()) {
                    fail(sheetPath, "ფურცლის სახელი ცარიელია.");
                }

                return validateProductImportEdits(rawSheet);
            });
        },
    );

    const productMappings = mapRecord(
        input.productMappings === undefined ? {} : input.productMappings,
        "პროდუქტების სვეტების არჩევანი",
        (rawFile, key, path) => {
            fileId(key, path);

            return mapRecord(rawFile, path, (rawMapping, sheetName, sheetPath) => {
                if (!sheetName.trim()) {
                    fail(sheetPath, "ფურცლის სახელი ცარიელია.");
                }

                return validateProductImportMapping(rawMapping);
            });
        },
    );

    const customerMappings = mapRecord(
        input.customerMappings,
        "სვეტების არჩევანი",
        (rawFile, key, path) => {
            fileId(key, path);

            return mapRecord(rawFile, path, (rawMapping, sheetName, sheetPath) => {
                if (!sheetName.trim()) {
                    fail(sheetPath, "ფურცლის სახელი ცარიელია.");
                }

                const mapping = object(rawMapping, sheetPath);

                if (
                    typeof mapping.enabled !== "boolean" ||
                    typeof mapping.includeNames !== "boolean"
                ) {
                    fail(sheetPath, "არჩევანის მნიშვნელობა არასწორია.");
                }

                const overrides: ImportCustomerMapping["overrides"] =
                    Object.fromEntries(
                        Object.entries(
                            object(mapping.overrides, sheetPath),
                        ).map(([field, column]) => [
                            fieldName(field, sheetPath),
                            column === null
                                ? null
                                : positiveInteger(column, sheetPath),
                        ]),
                    );

                return {
                    enabled: mapping.enabled,
                    headerRowNumber: positiveInteger(
                        mapping.headerRowNumber,
                        sheetPath,
                    ),
                    includeNames: true,
                    overrides,
                };
            });
        },
    );

    const customerEdits = mapRecord(
        input.customerEdits,
        "მომხმარებლების შესწორებები",
        (rawFile, key, path) => {
            fileId(key, path);

            return mapRecord(rawFile, path, (rawSheet, sheetName, sheetPath) => {
                if (!sheetName.trim()) {
                    fail(sheetPath, "ფურცლის სახელი ცარიელია.");
                }

                return mapRecord(rawSheet, sheetPath, (rawRow, rowKey, rowPath) => {
                    const rowNumber = Number(rowKey);

                    positiveInteger(rowNumber, rowPath);

                    if (String(rowNumber) !== rowKey) {
                        fail(rowPath, "რიგის ნომერი არასწორია.");
                    }

                    return Object.fromEntries(
                        Object.entries(object(rawRow, rowPath)).map(
                            ([field, fieldValue]) => {
                                const name = fieldName(field, rowPath);

                                if (typeof fieldValue !== "string") {
                                    fail(rowPath, "შესწორება ტექსტი უნდა იყოს.");
                                }

                                return [name, fieldValue];
                            },
                        ),
                    );
                });
            });
        },
    );

    const excludedCustomerKeys = validateImportRecordKeys(
        input.excludedCustomerKeys,
        "გამოტოვებული მომხმარებლები",
    );

    const excludedProductKeys = validateImportRecordKeys(
        input.excludedProductKeys === undefined
            ? []
            : input.excludedProductKeys,
        "გამოტოვებული პროდუქტები",
    );

    const existingProductLinks = validateExistingProductLinks(
        input.existingProductLinks === undefined
            ? {}
            : input.existingProductLinks,
        businessId,
    );

    const existingCustomerLinks: ImportExistingCustomerLinks = mapRecord(
        input.existingCustomerLinks,
        "არსებულ მომხმარებლებთან კავშირები",
        (rawLink, phone, path) => {
            if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
                fail(path, "ტელეფონის ფორმატი არასწორია.");
            }

            if (rawLink === null) return null;

            const link = object(rawLink, path);

            if (
                link.businessId !== businessId ||
                link.normalizedPhone !== phone
            ) {
                fail(path, "კავშირი აქტიურ ბიზნესს ან ნომერს არ შეესაბამება.");
            }

            const updatedAt = requiredText(link.updatedAt, path);

            if (!Number.isFinite(Date.parse(updatedAt))) {
                fail(path, "მომხმარებლის ცვლილების თარიღი არასწორია.");
            }

            return {
                businessId,
                customerId: requiredText(link.customerId, path),
                normalizedPhone: phone,
                updatedAt,
            };
        },
    );

    return {
        workspaceVersion: 1,
        orderMappings,
        orderEdits,
        orderOptions,
        orderCustomerDecisions,
        skipOrderCustomers: input.skipOrderCustomers === true,
        excludedOrderKeys,
        orderGroupingConfirmations,
        productPhotoDecisions,
        productDuplicateDecisions,
        productStockPolicy,
        productStockDate,
        existingProductLinks,
        productEdits,
        productMappings,
        customerMappings,
        customerEdits,
        excludedCustomerKeys,
        excludedProductKeys,
        existingCustomerLinks,
    };
}