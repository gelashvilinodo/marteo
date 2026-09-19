import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const SUPABASE_URL =
    "https://uwxmbyweyvnekzzecroz.supabase.co";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export class ProductImageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProductImageError";
    }
}

function getStorageClient() {
    let secret: unknown;

    try {
        const { env } = getCloudflareContext();

        secret = (
            env as unknown as Record<string, unknown>
        ).SUPABASE_SECRET_KEY;
    } catch {
        // ლოკალური განვითარების გარემო.
    }

    if (typeof secret !== "string" || !secret.trim()) {
        secret = process.env.SUPABASE_SECRET_KEY;
    }

    if (typeof secret !== "string" || !secret.trim()) {
        throw new ProductImageError(
            "ფოტოების საცავის სერვერული კონფიგურაცია აკლია.",
        );
    }

    return createClient(SUPABASE_URL, secret.trim(), {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}

function detectImage(bytes: Uint8Array) {
    const pngSignature = [
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
    ];

    if (
        bytes.length >= 8 &&
        pngSignature.every((byte, index) => bytes[index] === byte)
    ) {
        return {
            extension: "png",
            contentType: "image/png",
        };
    }

    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return {
            extension: "jpg",
            contentType: "image/jpeg",
        };
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
        return {
            extension: "webp",
            contentType: "image/webp",
        };
    }

    return null;
}

function validateBusinessId(businessId: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(businessId)) {
        throw new ProductImageError(
            "ბიზნესის კოდი არასწორია.",
        );
    }
}

// businessId უნდა მოგვაწოდოს ავტორიზებულმა სერვერულმა კოდმა.
export async function uploadProductImage(
    businessId: string,
    file: File,
) {
    validateBusinessId(businessId);

    if (!(file instanceof File) || file.size === 0) {
        throw new ProductImageError("აირჩიე პროდუქტის ფოტო.");
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new ProductImageError(
            "ფოტოს მაქსიმალური ზომაა 5 MB.",
        );
    }

    const buffer = await file.arrayBuffer();
    const image = detectImage(new Uint8Array(buffer));

    if (!image) {
        throw new ProductImageError(
            "ფოტო უნდა იყოს JPG, PNG ან WebP ფორმატში.",
        );
    }

    const storage = getStorageClient();

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
        throw new ProductImageError(
            "ფოტოს ატვირთვა ვერ მოხერხდა. სცადე ხელახლა.",
        );
    }

    const { data } = storage.storage
        .from(BUCKET)
        .getPublicUrl(path);

    return {
        path,
        url: data.publicUrl,
    };
}

// გამოიყენება მხოლოდ ამ ოპერაციაში ატვირთული,
// ბაზაში ჯერ დაუკავშირებელი ფოტოების გასასუფთავებლად.
export async function removeUncommittedProductImages(
    businessId: string,
    paths: string[],
) {
    validateBusinessId(businessId);

    const uniquePaths = [...new Set(paths)];

    if (uniquePaths.length === 0) return;

    for (const path of uniquePaths) {
        const parts = path.split("/");

        if (
            parts.length !== 2 ||
            parts[0] !== businessId ||
            !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(parts[1])
        ) {
            throw new ProductImageError(
                "ფოტოს გასუფთავების მისამართი არასწორია.",
            );
        }
    }

    const storage = getStorageClient();

    const { error } = await storage.storage
        .from(BUCKET)
        .remove(uniquePaths);

    if (error) {
        throw new ProductImageError(
            "გამოუყენებელი ფოტოების გასუფთავება ვერ მოხერხდა.",
        );
    }
}