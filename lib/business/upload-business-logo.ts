import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { BusinessSettingsError } from "@/lib/business/business-settings";

const SUPABASE_URL =
    "https://uwxmbyweyvnekzzecroz.supabase.co";

const BUCKET = "business-logos";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;

function getSecretKey(): string {
    let key: unknown;

    try {
        const { env } = getCloudflareContext();

        key = (
            env as unknown as Record<string, unknown>
        ).SUPABASE_SECRET_KEY;
    } catch {
        // Local development.
    }

    if (typeof key !== "string" || !key.trim()) {
        key = process.env.SUPABASE_SECRET_KEY;
    }

    if (typeof key !== "string" || !key.trim()) {
        throw new Error("Missing Supabase server configuration");
    }

    return key.trim();
}

function detectImage(bytes: Uint8Array) {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return { extension: "png", contentType: "image/png" };
    }

    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return { extension: "jpg", contentType: "image/jpeg" };
    }

    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return { extension: "webp", contentType: "image/webp" };
    }

    return null;
}

export async function readBusinessLogoForm(
    request: Request,
): Promise<FormData> {
    const contentType = request.headers.get("content-type");

    if (
        !contentType?.toLowerCase().startsWith("multipart/form-data;")
    ) {
        throw new BusinessSettingsError(
            "ფაილის გაგზავნის ფორმატი არასწორია.",
            400,
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new BusinessSettingsError("აირჩიე ლოგო.", 400);
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            totalSize += value.byteLength;

            if (totalSize > MAX_REQUEST_SIZE) {
                await reader.cancel();

                throw new BusinessSettingsError(
                    "ლოგოს მაქსიმალური ზომაა 2 MB.",
                    413,
                );
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const body = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        return await new Response(body.buffer, {
            headers: { "Content-Type": contentType },
        }).formData();
    } catch {
        throw new BusinessSettingsError(
            "ფაილის მონაცემები ვერ დამუშავდა.",
            400,
        );
    }
}

export async function uploadBusinessLogo(
    businessId: string,
    value: FormDataEntryValue | null,
): Promise<string> {
    if (!(value instanceof File) || value.size === 0) {
        throw new BusinessSettingsError("აირჩიე ლოგო.", 400);
    }

    if (value.size > MAX_FILE_SIZE) {
        throw new BusinessSettingsError(
            "ლოგოს მაქსიმალური ზომაა 2 MB.",
            413,
        );
    }

    const buffer = await value.arrayBuffer();
    const image = detectImage(new Uint8Array(buffer));

    if (!image) {
        throw new BusinessSettingsError(
            "აირჩიე PNG, JPG ან WEBP ფორმატის ფოტო.",
            400,
        );
    }

    const storage = createClient(
        SUPABASE_URL,
        getSecretKey(),
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        },
    );

    const path =
        `${businessId}/${crypto.randomUUID()}.${image.extension}`;

    const { error } = await storage.storage
        .from(BUCKET)
        .upload(path, buffer, {
            contentType: image.contentType,
            cacheControl: "3600",
            upsert: false,
        });

    if (error) {
        console.error("Business logo upload failed");

        throw new BusinessSettingsError(
            "ლოგო ვერ აიტვირთა. სცადე ხელახლა.",
            502,
        );
    }

    const { data } = storage.storage
        .from(BUCKET)
        .getPublicUrl(path);

    return data.publicUrl;
}