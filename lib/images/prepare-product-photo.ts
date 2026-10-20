"use client";

import { createProductThumbnail } from "./create-product-thumbnail";
import { extractDngPreview } from "./extract-dng-preview";

export type PreparedProductPhoto = {
    file: File;
    thumbnail: File | null;
};

type PreparePhotoOptions = {
    preserveTransparency?: boolean;
    createThumbnail?: boolean;
};

const MAX_SIDE = 1000;
const TARGET_BYTES = 200 * 1024;

// რამდენიმე ფოტოს ერთდროული გაშიფვრა ტელეფონის
// მეხსიერებას ზედმეტად არ უნდა ტვირთავდეს.
let queue: Promise<void> = Promise.resolve();

function encode(
    canvas: HTMLCanvasElement,
    quality: number,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (blob) resolve(blob);
                else reject(new Error("ფოტოს შემცირება ვერ მოხერხდა."));
            },
            "image/webp",
            quality,
        );
    });
}

async function decode(blob: Blob): Promise<{
    image: HTMLImageElement;
    release: () => void;
}> {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    try {
        image.src = url;
        await image.decode();

        if (!image.naturalWidth || !image.naturalHeight) {
            throw new Error("ფოტოს წაკითხვა ვერ მოხერხდა.");
        }

        return {
            image,
            release: () => {
                image.src = "";
                URL.revokeObjectURL(url);
            },
        };
    } catch {
        URL.revokeObjectURL(url);
        throw new Error("ფოტოს წაკითხვა ვერ მოხერხდა.");
    }
}

async function prepare(
    original: File,
    options: PreparePhotoOptions,
): Promise<PreparedProductPhoto> {
    const isDng =
        /\.dng$/i.test(original.name) ||
        /image\/(?:x-adobe-dng|dng)/i.test(original.type);
    const isHeic =
        /image\/hei[cf]/i.test(original.type) ||
        /\.(heic|heif)$/i.test(original.name);

    const looksLikeImage =
        isDng ||
        original.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(
            original.name,
        );

    if (!looksLikeImage) {
        throw new Error("აირჩიე ფოტო და არა სხვა ტიპის ფაილი.");
    }

    if (original.size === 0) {
        throw new Error("ფოტოს ფაილი ცარიელია. აირჩიე ხელახლა.");
    }

    let decoded: Awaited<ReturnType<typeof decode>>;

    try {
        // თუ ბრაუზერი თვითონ კითხულობს ფოტოს,
        // დამატებითი გარდაქმნა აღარ გვჭირდება.
        const source = isDng
            ? await extractDngPreview(original)
            : original;

        decoded = await decode(source);
    } catch {
        if (isDng) {
            throw new Error(
                "ამ DNG ფოტოს პრევიუ ვერ დამუშავდა. აირჩიე სხვა ფოტო.",
            );
        }
        if (!isHeic) {
            throw new Error(
                "ფოტო ვერ გაიხსნა. ფაილი შესაძლოა დაზიანებულია ან მისი ფორმატი არ არის მხარდაჭერილი.",
            );
        }

        try {
            const { heicTo } = await import("heic-to/csp");

            const converted = await heicTo({
                blob: original,
                type: "image/jpeg",
                quality: 0.85,
            });

            if (!(converted instanceof Blob)) {
                throw new Error("გარდაქმნის შედეგი არასწორია.");
            }

            decoded = await decode(converted);
        } catch {
            throw new Error(
                "iPhone-ის ფოტოს დამუშავება ვერ მოხერხდა. სცადე ხელახლა ან აირჩიე სხვა ფოტო.",
            );
        }
    }

    const canvas = document.createElement("canvas");

    try {
        const { image } = decoded;
        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("ფოტოს მომზადება ვერ მოხერხდა.");
        }

        const originalSide = Math.max(
            image.naturalWidth,
            image.naturalHeight,
        );

        let side = Math.min(MAX_SIDE, originalSide);
        let result: Blob | null = null;

        // ჯერ ხარისხს ვამცირებთ, შემდეგ საჭიროებისას ზომასაც.
        for (let attempt = 0; attempt < 7; attempt++) {
            const scale = Math.min(1, side / originalSide);

            canvas.width = Math.max(
                1,
                Math.round(image.naturalWidth * scale),
            );
            canvas.height = Math.max(
                1,
                Math.round(image.naturalHeight * scale),
            );

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";

            // გამჭვირვალე PNG-ს JPEG-ზე გადასვლის შემთხვევაშიც
            // შავი ფონი არ უნდა გაუჩნდეს.
            if (options.preserveTransparency) {
                context.clearRect(0, 0, canvas.width, canvas.height);
            } else {
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, canvas.width, canvas.height);
            }
            context.drawImage(
                image,
                0,
                0,
                canvas.width,
                canvas.height,
            );

            for (const quality of [0.65, 0.5, 0.35]) {
                const candidate = await encode(canvas, quality);

                if (!result || candidate.size < result.size) {
                    result = candidate;
                }

                if (result.size <= TARGET_BYTES) break;
            }

            if (result && result.size <= TARGET_BYTES) break;

            side = Math.max(1, Math.floor(side * 0.75));
        }

        const originalIsSupported =
            ["image/jpeg", "image/png", "image/webp"].includes(
                original.type,
            );

        // უკვე პატარა, მხარდაჭერილ ორიგინალს არ ვზრდით.
        const keepOriginal =
            originalIsSupported &&
            original.size <= TARGET_BYTES &&
            (!result || original.size <= result.size);

        if (!keepOriginal && (!result || result.size > TARGET_BYTES)) {
            throw new Error(
                "ფოტოს საკმარისად შემცირება ვერ მოხერხდა. სცადე სხვა ფოტო.",
            );
        }

        let file = original;

        if (!keepOriginal && result) {
            const extension =
                result.type === "image/webp" ? "webp" :
                    result.type === "image/jpeg" ? "jpg" : "png";

            const baseName =
                original.name.replace(/\.[^.]+$/, "") || "product";

            file = new File(
                [result],
                `${baseName}.${extension}`,
                {
                    type: result.type,
                    lastModified: original.lastModified,
                },
            );
        }

        const thumbnail = options.createThumbnail === false
            ? null
            : await createProductThumbnail(file);

        return { file, thumbnail };
    } finally {
        decoded.release();
        canvas.width = 0;
        canvas.height = 0;
    }
}

export function prepareProductPhoto(
    original: File,
    options: PreparePhotoOptions = {},
): Promise<PreparedProductPhoto> {
    const task = queue.then(() => prepare(original, options));

    queue = task.then(
        () => undefined,
        () => undefined,
    );

    return task;
}