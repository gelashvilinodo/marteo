import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { ProfileSettingsError } from "@/lib/profile/profile-settings";

const SUPABASE_URL =
    "https://uwxmbyweyvnekzzecroz.supabase.co";

const BUCKET = "user-avatars";
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
    const pngSignature = [
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
    ];

    if (
        bytes.length >= pngSignature.length &&
        pngSignature.every((value, index) => bytes[index] === value)
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

export async function readProfileAvatarForm(
    request: Request,
): Promise<FormData> {
    const contentType = request.headers.get("content-type");

    if (
        !contentType?.toLowerCase().startsWith("multipart/form-data;")
    ) {
        throw new ProfileSettingsError(
            "ფაილის გაგზავნის ფორმატი არასწორია.",
            400,
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new ProfileSettingsError("აირჩიე ფოტო.", 400);
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

                throw new ProfileSettingsError(
                    "ფოტოს მაქსიმალური ზომაა 2 MB.",
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
        throw new ProfileSettingsError(
            "ფაილის მონაცემები ვერ დამუშავდა.",
            400,
        );
    }
}

export async function uploadProfileAvatar(
    userId: string,
    value: FormDataEntryValue | null,
): Promise<string> {
    if (!(value instanceof File) || value.size === 0) {
        throw new ProfileSettingsError("აირჩიე ფოტო.", 400);
    }

    if (value.size > MAX_FILE_SIZE) {
        throw new ProfileSettingsError(
            "ფოტოს მაქსიმალური ზომაა 2 MB.",
            413,
        );
    }

    const buffer = await value.arrayBuffer();
    const image = detectImage(new Uint8Array(buffer));

    if (!image) {
        throw new ProfileSettingsError(
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
        `${userId}/${crypto.randomUUID()}.${image.extension}`;

    const { error } = await storage.storage
        .from(BUCKET)
        .upload(path, buffer, {
            contentType: image.contentType,
            cacheControl: "3600",
            upsert: false,
        });

    if (error) {
        console.error("Profile avatar upload failed", {
            name: error.name,
            message: error.message,
            statusCode:
                "statusCode" in error
                    ? error.statusCode
                    : undefined,
            bucket: BUCKET,
            contentType: image.contentType,
            bytes: buffer.byteLength,
        });

        throw new ProfileSettingsError(
            "ფოტო ვერ აიტვირთა. სცადე ხელახლა.",
            502,
        );
    }

    const { data } = storage.storage
        .from(BUCKET)
        .getPublicUrl(path);

    return data.publicUrl;
}