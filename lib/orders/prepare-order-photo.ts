"use client";

export async function prepareOrderPhoto(file: File): Promise<File> {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
        image.src = url;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error();
        let scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
        // Fit the existing storage transport automatically; never ask the user to resize.
        for (let attempt = 0; attempt < 8; attempt++) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext("2d");
            if (!context) throw new Error();
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.86));
            if (!blob) throw new Error();
            if (blob.size <= 4.5 * 1024 * 1024) {
                const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
                return new File([blob], `order-photo.${extension}`, { type: blob.type });
            }
            scale *= 0.75;
        }
        throw new Error();
    } catch {
        throw new Error("ფოტო ვერ დამუშავდა. სცადე სხვა ფოტო ან შეინახე JPG ფორმატში.");
    } finally {
        URL.revokeObjectURL(url);
    }
}
