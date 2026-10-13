import { OrderValidationError } from "@/lib/orders/validate-order";
import { validCalendarDate } from "./calendar-period";
import { contentTypes, contentPlatforms } from "./content-options";
export { contentTypes, contentPlatforms } from "./content-options";

function fail(message: string): never {
    throw new OrderValidationError(message, 422);
}

export function contentBody(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail("კონტენტის მონაცემების ფორმატი არასწორია.");
    }

    return value as Record<string, unknown>;
}

function text(value: unknown, label: string) {
    if (value === undefined || value === null) return "";

    if (typeof value !== "string") {
        fail(`${label}: მონაცემის ფორმატი არასწორია.`);
    }

    return value.normalize("NFC").trim();
}

export function contentRequestId(value: unknown) {
    const id = text(value, "მოთხოვნის კოდი").toLowerCase();

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ) {
        fail("მოთხოვნის კოდი არასწორია.");
    }

    return id;
}

export function contentVersion(value: unknown) {
    const version = text(value, "კონტენტის ვერსია");
    const date = new Date(version);

    if (!version || !Number.isFinite(date.getTime())) {
        fail("გახსენი კონტენტი ხელახლა და სცადე კიდევ ერთხელ.");
    }

    return date;
}

export function validateContent(raw: unknown) {
    const body = contentBody(raw);
    const title = text(body.title, "სათაური");

    if (!title) fail("მიუთითე კონტენტის სათაური.");

    const description = text(body.description, "აღწერა");
    const type = contentTypes.find(
        item => item.value === body.type,
    )?.value;

    if (!type) fail("აირჩიე კონტენტის ტიპი.");

    const customType =
        type === "OTHER"
            ? text(body.customType, "კონტენტის ტიპის დასახელება")
            : null;

    if (type === "OTHER" && !customType) {
        fail("მიუთითე, რა ტიპის კონტენტია.");
    }

    if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
        fail("აირჩიე მინიმუმ ერთი პლატფორმა.");
    }

    const platforms = body.platforms.map(value => {
        const platform = contentPlatforms.find(
            item => item.value === value,
        )?.value;

        if (!platform) fail("არჩეული პლატფორმა არასწორია.");

        return platform;
    });

    if (new Set(platforms).size !== platforms.length) {
        fail("პლატფორმა არ უნდა მეორდებოდეს.");
    }

    const customPlatform = platforms.includes("OTHER")
        ? text(body.customPlatform, "პლატფორმის დასახელება")
        : null;

    if (platforms.includes("OTHER") && !customPlatform) {
        fail("მიუთითე სხვა პლატფორმის დასახელება.");
    }

    const scheduledDate = text(body.scheduledDate, "თარიღი");
    const scheduledTime = text(body.scheduledTime, "დრო");

    if (!validCalendarDate(scheduledDate)) {
        fail("მიუთითე სწორი თარიღი.");
    }

    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
        fail("მიუთითე სწორი დრო.");
    }

    const scheduledAt = new Date(
        `${scheduledDate}T${scheduledTime}:00+04:00`,
    );

    if (!Number.isFinite(scheduledAt.getTime())) {
        fail("კონტენტის დაგეგმილი დრო არასწორია.");
    }

    const link = text(body.materialUrl, "მასალის ბმული");
    let materialUrl: string | null = null;

    if (link) {
        let url: URL;

        try {
            url = new URL(link);
        } catch {
            fail("მასალის ბმული მიუთითე სრული მისამართით.");
        }

        if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password
        ) {
            fail("მასალის ბმული უნდა იწყებოდეს https:// ან http://-ით.");
        }

        materialUrl = url.href;
    }

    return {
        title,
        description: description || null,
        type,
        customType,
        platforms,
        customPlatform,
        scheduledAt,
        materialUrl,
    };
}