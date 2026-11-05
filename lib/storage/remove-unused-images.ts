import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSecretKey } from "@/lib/business/upload-business-logo";

const STORAGE_ORIGIN = "https://uwxmbyweyvnekzzecroz.supabase.co";

export type ReplaceableImageBucket = "business-logos" | "user-avatars";

// Only server-generated public paths: "<owner>/<uuid>.<ext>".
function storagePath(
    bucket: ReplaceableImageBucket,
    url: string,
): string | null {
    const prefix = `${STORAGE_ORIGIN}/storage/v1/object/public/${bucket}/`;

    if (!url.startsWith(prefix)) return null;

    const path = url.slice(prefix.length);

    return /^[A-Za-z0-9_-]{1,100}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(path)
        ? path
        : null;
}

// ძველ ან შეუნახავ ფოტოს შლის მხოლოდ მაშინ, როცა ბაზაში
// აღარაფერი მიუთითებს. შეცდომა პასუხს არ აფუჭებს:
// უარეს შემთხვევაში გამოუყენებელი ფაილი რჩება საცავში.
export async function removeUnusedImages(
    bucket: ReplaceableImageBucket,
    urls: Array<string | null | undefined>,
    findUsed: (urls: string[]) => Promise<Array<string | null>>,
): Promise<void> {
    const candidates = [
        ...new Set(
            urls.filter(
                (url): url is string =>
                    typeof url === "string" &&
                    storagePath(bucket, url) !== null,
            ),
        ),
    ];

    if (candidates.length === 0) return;

    try {
        const used = new Set(await findUsed(candidates));
        const paths = candidates
            .filter(url => !used.has(url))
            .map(url => storagePath(bucket, url) as string);

        if (paths.length === 0) return;

        const storage = createClient(STORAGE_ORIGIN, getSecretKey(), {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        });

        const { error } = await storage.storage.from(bucket).remove(paths);

        if (error) console.error("Unused image cleanup failed", bucket);
    } catch {
        console.error("Unused image cleanup could not be confirmed", bucket);
    }
}
