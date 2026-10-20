export type ImportIssue = {
    severity: "ERROR" | "WARNING";
    code: string;
    field: string | null;
    message: string;
};

export type ImportSourceReference = {
    fileId: string;
    sheetName: string;
    rowNumbers: number[];
};

export type ImportValidationResult<T> =
    | {
        valid: true;
        data: T;
        issues: ImportIssue[];
    }
    | {
        valid: false;
        data: null;
        issues: ImportIssue[];
    };

export type ImportedCustomer = {
    phone: string;
    firstName: string | null;
    lastName: string | null;
    address: string;
};

export type ImportCustomerEdits = Record<
    number,
    Partial<Record<
        "phone" | "address" | "firstName" | "lastName" | "sourceCode",
        string
    >>
>;

export type ImportCustomerEditHandler = (
    rowNumber: number,
    field: "phone" | "address" | "firstName" | "lastName" | "sourceCode",
    value: string,
) => void;

export type ImportCustomerMapping = {
    enabled: boolean;
    headerRowNumber: number;
    includeNames: boolean;
    overrides: Partial<Record<
        "phone" | "address" | "firstName" | "lastName" | "sourceCode",
        number | null
    >>;
};

export type ImportExistingCustomerLink = {
    businessId: string;
    customerId: string;
    normalizedPhone: string;
    updatedAt: string;
};

export type ImportExistingCustomerLinks = Record<
    string,
    ImportExistingCustomerLink | null
>;

export type ImportExistingCustomerMatch = {
    id: string;
    phone: string;
    normalizedPhone: string;
    firstName: string | null;
    lastName: string | null;
    address: string | null;
    deletedAt: string | null;
    updatedAt: string;
};

export type ImportCustomerCheckSnapshot = {
    businessId: string | null;
    requestedPhones: string[];
    checkedPhones: string[];
    failedPhones: string[];
    matches: ImportExistingCustomerMatch[];
    checkedAt: string;
};