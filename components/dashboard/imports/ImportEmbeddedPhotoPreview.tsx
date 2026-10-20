"use client";

import { useEffect, useState } from "react";

import type {
    ImportEmbeddedPhoto,
} from "@/lib/imports/import-photo-types";

type Preview = {
    photo: ImportEmbeddedPhoto;
    url: string;
};

export default function ImportEmbeddedPhotoPreview({
    photos,
}: {
    photos: readonly ImportEmbeddedPhoto[];
}) {
    const [previews, setPreviews] = useState<Preview[]>([]);

    useEffect(() => {
        const next: Preview[] = [];
        let active = true;
        // Blob URLs are external resources. Cancel deferred setup on unmount
        // and release only the URLs owned by this effect.
        queueMicrotask(() => {
            if (!active) return;
            try {
                for (const photo of photos) {
                    next.push({ photo, url: URL.createObjectURL(photo.blob) });
                }
            } catch {
                for (const item of next) URL.revokeObjectURL(item.url);
                next.length = 0;
            }
            setPreviews(next);
        });
        return () => {
            active = false;
            for (const item of next) URL.revokeObjectURL(item.url);
        };
    }, [photos]);

    if (photos.length === 0) return null;

    return (
        <div className="space-y-3">
            <p className="text-xs text-text-secondary">
                მდებარეობა განსაზღვრულია ფოტოს ზედა მარცხენა
                კუთხის მიხედვით. გადაამოწმე, რომ მითითებული
                რიგი შესაბამის პროდუქტს ეკუთვნის.
            </p>

            {previews.length === 0 ? (
                <p role="status" className="text-sm text-text-secondary">
                    ფოტოების პრევიუ ვერ გამოჩნდა.
                    ფაილის ხელახლა არჩევა შეგიძლია.
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {previews.map(({ photo, url }, index) => (
                        <figure
                            key={`${photo.sourcePath}:${photo.sheetName}:${photo.rowNumber}:${index}`}
                            className="min-w-0 rounded-xl border border-border p-2"
                        >
                            {/* ლოკალური Blob-ის პრევიუ; ქსელში არ იგზავნება. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt={`${photo.sheetName}, რიგი ${photo.rowNumber}`}
                                loading="lazy"
                                className="h-28 w-full rounded-lg object-contain"
                            />

                            <figcaption className="mt-2 break-words text-xs text-text-secondary">
                                {photo.sheetName}
                                {" — რიგი "}
                                {photo.rowNumber}
                            </figcaption>
                        </figure>
                    ))}
                </div>
            )}
        </div>
    );
}
