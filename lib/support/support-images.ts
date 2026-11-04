import "server-only";
import { createClient } from "@supabase/supabase-js";
import { detectImage, getSecretKey } from "@/lib/business/upload-business-logo";
import { SUPPORT_IMAGE_MAX_BYTES } from "./support-config";
import { SupportError, readSupportText } from "./support-chat";
import { guardMutation } from "@/lib/security/mutation-request";

const SUPABASE_URL = "https://uwxmbyweyvnekzzecroz.supabase.co";

// Private bucket: images are served only through the support image routes,
// which check that the viewer belongs to the conversation.
export const SUPPORT_IMAGE_BUCKET = "support-images";

export type SupportImage = { bytes: ArrayBuffer; extension: string; contentType: string };

function storage() {
    return createClient(SUPABASE_URL, getSecretKey(), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }).storage;
}

export async function readSupportImage(value: FormDataEntryValue | null): Promise<SupportImage | null> {
    if (value === null) return null;
    if (!(value instanceof File) || value.size === 0) throw new SupportError("ფოტო ვერ წაიკითხა.");
    if (value.size > SUPPORT_IMAGE_MAX_BYTES) throw new SupportError("ფოტოს მაქსიმალური ზომაა 2 MB.", 413);
    const bytes = await value.arrayBuffer();
    const image = detectImage(new Uint8Array(bytes));
    if (!image) throw new SupportError("აირჩიე PNG, JPG ან WEBP ფორმატის ფოტო.");
    return { bytes, ...image };
}

export async function uploadSupportImage(conversationId: string, image: SupportImage) {
    const path = `${conversationId}/${crypto.randomUUID()}.${image.extension}`;
    const upload = () => storage().from(SUPPORT_IMAGE_BUCKET).upload(path, image.bytes, { contentType: image.contentType, upsert: false });
    let { error } = await upload();
    // The bucket is created on first use, so no manual setup is needed.
    if (error && /not.?found/i.test(error.message)) {
        await storage().createBucket(SUPPORT_IMAGE_BUCKET, {
            public: false,
            fileSizeLimit: SUPPORT_IMAGE_MAX_BYTES,
            allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        });
        ({ error } = await upload());
    }
    if (error) {
        console.error("Support image upload failed");
        throw new SupportError("ფოტო ვერ აიტვირთა. სცადე ხელახლა.", 502);
    }
    return path;
}

export async function downloadSupportImage(path: string) {
    const { data, error } = await storage().from(SUPPORT_IMAGE_BUCKET).download(path);
    if (error || !data) throw new SupportError("ფოტო ვერ მოიძებნა.", 404);
    return data;
}

export async function removeSupportImages(paths: string[]) {
    if (!paths.length) return;
    const { error } = await storage().from(SUPPORT_IMAGE_BUCKET).remove(paths);
    if (error) throw new Error("Support image removal failed");
}

const isMultipart = (request: Request) => request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;

// A message is JSON text, or a form with a photo and optional text.
export function guardSupportPost(handler: (request: Request) => Promise<Response>) {
    return (request: Request) => guardMutation(handler, isMultipart(request) ? "multipart" : "json")(request);
}

export async function readSupportMessage(request: Request): Promise<{ text: string; image: SupportImage | null }> {
    if (!isMultipart(request)) return { text: readSupportText(await request.json()), image: null };
    const form = await request.formData().catch(() => { throw new SupportError("ფაილის მონაცემები ვერ დამუშავდა."); });
    const image = await readSupportImage(form.get("file"));
    return { text: readSupportText({ text: form.get("text") ?? "" }, Boolean(image)), image };
}

export function supportImageResponse(image: Blob) {
    return new Response(image, {
        headers: {
            "Content-Type": image.type || "application/octet-stream",
            "Cache-Control": "private, max-age=86400, immutable",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
