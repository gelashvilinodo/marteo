"use client";

import { readImportFile } from "@/lib/imports/read-import-file-client";
import type { AiSourceRow } from "./purchase-draft-types";

const MAX_ROWS = 400;
const MAX_CELLS = 30;
const MAX_CELL_LENGTH = 300;
// გაგზავნის ზღვარი 64 KB-ია; ნაწილი JSON-ის სტრუქტურას რჩება.
const MAX_BYTES = 58 * 1024;

export type AiPurchaseFile = { rows: AiSourceRow[]; photoCount: number };

// ფაილს არსებული იმპორტის Worker კითხულობს; სერვერზე მხოლოდ ცხრილის ტექსტი მიდის.
export async function readPurchaseFile(file: File, signal?: AbortSignal): Promise<AiPurchaseFile> {
    let photoCount = 0;
    const parsed = await readImportFile(file, {
        signal,
        onPhotos: (result) => {
            photoCount = result.photos.length;
        },
    });

    const sheets = parsed.sheets
        .filter((sheet) => !sheet.hidden)
        .map((sheet) => ({
            name: sheet.name,
            rows: sheet.rows
                .map((row) => {
                    const cells = row.cells.map((cell) =>
                        (cell.displayText ?? (cell.value === null ? "" : String(cell.value)))
                            .replace(/\s+/g, " ")
                            .trim()
                            .slice(0, MAX_CELL_LENGTH));

                    while (cells.length && !cells[cells.length - 1]) cells.pop();
                    return { row: row.rowNumber, cells: cells.slice(0, MAX_CELLS) };
                })
                .filter((row) => row.cells.some(Boolean)),
        }))
        .filter((sheet) => sheet.rows.length > 0)
        .sort((a, b) => b.rows.length - a.rows.length);

    const sheet = sheets[0];

    if (!sheet) {
        throw new Error("ფაილში ცხრილი ვერ ვიპოვე.");
    }

    if (sheet.rows.length > MAX_ROWS) {
        throw new Error(`ფაილში ${sheet.rows.length} რიგია. ერთ ჯერზე მაქსიმუმ ${MAX_ROWS} რიგი მუშავდება; დაყავი ფაილი.`);
    }

    if (new TextEncoder().encode(JSON.stringify(sheet.rows)).byteLength > MAX_BYTES) {
        throw new Error("ფაილის ცხრილი ძალიან დიდია. დატოვე მხოლოდ საჭირო სვეტები ან დაყავი ფაილი.");
    }

    return { rows: sheet.rows, photoCount };
}
