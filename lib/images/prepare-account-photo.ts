"use client";

import { prepareProductPhoto } from "./prepare-product-photo";

export async function prepareAccountPhoto(
    original: File,
    signal?: AbortSignal,
): Promise<File> {
    signal?.throwIfAborted();

    const prepared = await prepareProductPhoto(original, {
        preserveTransparency: true,
        createThumbnail: false,
    });

    signal?.throwIfAborted();

    return prepared.file;
}