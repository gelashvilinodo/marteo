"use client";

import { extractDngPreview } from "./extract-dng-preview";

// ბიზნესის ლოგო მომავალში მართეო მარკეტშიც გამოჩნდება, ამიტომ
// პროდუქტის ფოტოსავით არ ვკუმშავთ. ორიგინალს უცვლელად ვტვირთავთ,
// თუ ის უკვე მხარდაჭერილ ფორმატშია და ლიმიტებში ჯდება. სხვა
// შემთხვევაში (HEIC, DNG, ძალიან დიდი ფოტო) მაღალი ხარისხით ვაკონვერტებთ.
const MAX_SIDE = 2048;
// სერვერის ლიმიტი (lib/business/upload-business-logo.ts) არის 2 MB.
const MAX_BYTES = 2 * 1024 * 1024 - 16 * 1024;
const QUALITIES = [0.95, 0.92, 0.88, 0.84, 0.8];

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

function encode(
    canvas: HTMLCanvasElement,
    quality: number,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (blob) resolve(blob);
                else reject(new Error("ლოგოს მომზადება ვერ მოხერხდა."));
            },
            "image/webp",
            quality,
        );
    });
}

export async function prepareBusinessLogo(
    original: File,
    signal?: AbortSignal,
): Promise<File> {
    signal?.throwIfAborted();

    const isDng =
        /\.dng$/i.test(original.name) ||
        /image\/(?:x-adobe-dng|dng)/i.test(original.type);
    const isHeic =
        /image\/hei[cf]/i.test(original.type) ||
        /\.(heic|heif)$/i.test(original.name);

    const looksLikeImage =
        isDng ||
        original.type.startsWith("image/") ||
        /\.(jpe?g|jfif|png|webp|heic|heif|avif|gif|bmp|tiff?|svg)$/i.test(
            original.name,
        );

    if (!looksLikeImage) {
        throw new Error("აირჩიეთ ფოტო და არა სხვა ტიპის ფაილი.");
    }

    if (original.size === 0) {
        throw new Error("ფოტოს ფაილი ცარიელია. აირჩიეთ ხელახლა.");
    }

    let decoded: Awaited<ReturnType<typeof decode>>;

    try {
        decoded = await decode(
            isDng ? await extractDngPreview(original) : original,
        );
    } catch {
        if (isDng) {
            throw new Error(
                "ამ DNG ფოტოს პრევიუ ვერ დამუშავდა. აირჩიეთ სხვა ფოტო.",
            );
        }
        if (!isHeic) {
            throw new Error(
                "ფოტო ვერ გაიხსნა. ფაილი შესაძლოა დაზიანებულია ან მისი ფორმატი არ არის მხარდაჭერილი.",
            );
        }

        try {
            const { heicTo } = await (typeof window !== "undefined"
                ? import("heic-to/csp")
                : Promise.reject(new Error("Photo conversion requires a browser")));

            const converted = await heicTo({
                blob: original,
                type: "image/jpeg",
                quality: 0.95,
            });

            if (!(converted instanceof Blob)) {
                throw new Error("გარდაქმნის შედეგი არასწორია.");
            }

            decoded = await decode(converted);
        } catch {
            throw new Error(
                "iPhone-ის ფოტოს დამუშავება ვერ მოხერხდა. სცადეთ ხელახლა ან აირჩიეთ სხვა ფოტო.",
            );
        }
    }

    const canvas = document.createElement("canvas");

    try {
        signal?.throwIfAborted();

        const { image } = decoded;
        const originalSide = Math.max(
            image.naturalWidth,
            image.naturalHeight,
        );

        const originalIsSupported =
            ["image/jpeg", "image/png", "image/webp"].includes(
                original.type,
            );

        // ხარისხიან ლოგოს ხელს არ ვახლებთ.
        if (
            originalIsSupported &&
            originalSide <= MAX_SIDE &&
            original.size <= MAX_BYTES
        ) {
            return original;
        }

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("ლოგოს მომზადება ვერ მოხერხდა.");
        }

        let side = Math.min(MAX_SIDE, originalSide);
        let result: Blob | null = null;

        // ჯერ ხარისხს ოდნავ ვამცირებთ, ზომას მხოლოდ უკიდურეს შემთხვევაში.
        for (let attempt = 0; attempt < 4 && !result; attempt++) {
            const scale = Math.min(1, side / originalSide);

            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            // გამჭვირვალე ლოგოს ფონი გამჭვირვალედ რჩება.
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            for (const quality of QUALITIES) {
                signal?.throwIfAborted();

                const candidate = await encode(canvas, quality);

                if (candidate.size <= MAX_BYTES) {
                    result = candidate;
                    break;
                }
            }

            side = Math.max(1, Math.floor(side * 0.8));
        }

        if (!result) {
            throw new Error(
                "ლოგოს ფაილი ზედმეტად დიდია. სცადეთ სხვა ფოტო.",
            );
        }

        const baseName =
            original.name.replace(/\.[^.]+$/, "") || "logo";

        return new File([result], `${baseName}.webp`, {
            type: "image/webp",
            lastModified: original.lastModified,
        });
    } finally {
        decoded.release();
        canvas.width = 0;
        canvas.height = 0;
    }
}
