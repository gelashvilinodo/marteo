"use client";

import { useState } from "react";

import type {
    SavedImportPhoto,
} from "@/lib/imports/read-saved-import-photos";

export default function ImportSavedPhotoPreview({
    photos,
}: {
    photos: readonly SavedImportPhoto[];
}) {
    const [failedUrls, setFailedUrls] = useState<Set<string>>(
        () => new Set(),
    );

    if (photos.length === 0) return null;

    return (
        <details className="mt-3 rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm">
                მონახაზში შენახული ფოტოები ({photos.length})
            </summary>

            <p className="mt-3 text-xs text-text-secondary">
                ეს ფოტოები უკვე ატვირთულია.
                ხელახლა შემცირება და ატვირთვა საჭირო არ არის.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map(photo => (
                    <figure
                        key={photo.id}
                        className="min-w-0 rounded-xl border border-border p-2"
                    >
                        {failedUrls.has(photo.imageUrl) ? (
                            <p
                                role="status"
                                className="flex h-28 items-center text-xs text-danger"
                            >
                                ფოტოს პრევიუ ვერ ჩაიტვირთა.
                                შენახული ჩანაწერი არ წაშლილა.
                            </p>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={photo.imageUrl}
                                alt={`${photo.sheetName}, რიგი ${photo.rowNumber}`}
                                loading="lazy"
                                className="h-28 w-full rounded-lg object-contain"
                                onError={() => {
                                    setFailedUrls(current => {
                                        const next = new Set(current);
                                        next.add(photo.imageUrl);
                                        return next;
                                    });
                                }}
                            />
                        )}

                        <figcaption className="mt-2 break-words text-xs text-text-secondary">
                            {photo.sheetName}
                            {" - რიგი "}
                            {photo.rowNumber}
                        </figcaption>
                    </figure>
                ))}
            </div>
        </details>
    );
}