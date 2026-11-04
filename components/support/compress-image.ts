import { SUPPORT_IMAGE_MAX_BYTES } from "@/lib/support/support-config";

// Phone photos and screenshots shrink to a readable JPEG of a few hundred KB,
// which keeps uploads fast and storage small.
const STEPS = [{ side: 1600, quality: 0.82 }, { side: 1280, quality: 0.72 }, { side: 960, quality: 0.62 }];

export async function compressSupportImage(file: File): Promise<Blob> {
    if (!file.type.startsWith("image/")) throw new Error("აირჩიე ფოტო.");
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error("ეს ფოტო ვერ წაიკითხა. სცადე სხვა ფორმატი (JPG ან PNG).");
    }
    try {
        for (const step of STEPS) {
            const scale = Math.min(1, step.side / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext("2d");
            if (!context) break;
            // Transparent screenshots get a white background instead of black.
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", step.quality));
            if (blob && blob.size <= SUPPORT_IMAGE_MAX_BYTES) return blob;
        }
    } finally {
        bitmap.close();
    }
    throw new Error("ფოტო ძალიან დიდია.");
}
