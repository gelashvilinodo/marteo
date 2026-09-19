import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

const SUPABASE_URL =
    "https://uwxmbyweyvnekzzecroz.supabase.co";

const BUCKET = "business-logos";
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Allow some space for multipart form metadata.
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;

function errorResponse(message: string, status: number) {
    return NextResponse.json(
        { error: message },
        { status }
    );
}

function getSecretKey(): string {
    let key: unknown;

    try {
        const { env } = getCloudflareContext();

        key = (
            env as unknown as Record<string, unknown>
        ).SUPABASE_SECRET_KEY;
    } catch {
        // Local Next.js development.
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

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return errorResponse(
                "ფოტოს ასატვირთად შედით ანგარიშში.",
                401
            );
        }

        const prisma = createPrismaClient();

        const existingBusiness =
            await prisma.businessMembership.findFirst({
                where: {
                    userId: user.id,
                    role: "OWNER",
                },
                select: { id: true },
            });

        if (existingBusiness) {
            return errorResponse(
                "ბიზნესი უკვე შექმნილია. ეს ატვირთვა მხოლოდ რეგისტრაციისთვისაა.",
                409
            );
        }

        const contentType = request.headers.get("content-type");

        if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
            return errorResponse(
                "ფაილის გაგზავნის ფორმატი არასწორია.",
                400
            );
        }

        // Enforce the request limit even without a Content-Length header.
        const reader = request.body?.getReader();

        if (!reader) {
            return errorResponse("აირჩიეთ ფოტო.", 400);
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

                    return errorResponse(
                        "ლოგოს მაქსიმალური ზომაა 2MB.",
                        413
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

        let formData: FormData;

        try {
            formData = await new Response(body.buffer, {
                headers: { "Content-Type": contentType },
            }).formData();
        } catch {
            return errorResponse(
                "ფაილის მონაცემები ვერ დამუშავდა.",
                400
            );
        }

        const file = formData.get("file");

        if (!(file instanceof File) || file.size === 0) {
            return errorResponse("აირჩიეთ ფოტო.", 400);
        }

        if (file.size > MAX_FILE_SIZE) {
            return errorResponse(
                "ლოგოს მაქსიმალური ზომაა 2MB.",
                413
            );
        }

        const buffer = await file.arrayBuffer();
        const image = detectImage(new Uint8Array(buffer));

        if (!image) {
            return errorResponse(
                "ლოგო უნდა იყოს PNG, JPG ან WEBP ფორმატში.",
                400
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
            }
        );

        // The server chooses both the folder and the filename.
        const path =
            `${user.id}/${crypto.randomUUID()}.${image.extension}`;

        const { error: uploadError } = await storage.storage
            .from(BUCKET)
            .upload(path, buffer, {
                contentType: image.contentType,
                cacheControl: "3600",
                upsert: false,
            });

        if (uploadError) {
            console.error("Logo storage upload failed", {
                name: uploadError.name,
                message: uploadError.message,
            });

            return errorResponse(
                "ლოგოს შენახვა ვერ მოხერხდა. გთხოვთ სცადოთ ხელახლა.",
                502
            );
        }

        const { data } = storage.storage
            .from(BUCKET)
            .getPublicUrl(path);

        return NextResponse.json(
            { logoUrl: data.publicUrl },
            { status: 201 }
        );
    } catch {
        console.error("Logo upload request failed");

        return errorResponse(
            "ფოტოს ატვირთვისას სერვერის შეცდომა დაფიქსირდა.",
            500
        );
    }
}