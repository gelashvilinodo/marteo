"use client";

// Encoding happens in the browser, never on the Worker.
export async function createProductThumbnail(file: File): Promise<File | null> {
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) return null;
        const scale = Math.min(1, 192 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.78));
        if (!blob || blob.size > 100 * 1024) return null;
        return new File([blob], "thumbnail", { type: blob.type });
    } catch {
        // Unsupported encoders/images keep the existing original-image flow.
        return null;
    } finally { URL.revokeObjectURL(url); }
}
