import type { OrderInvoiceData } from "./invoice-types";
import type {
    PDFFont,
    PDFPage,
    PDFImage,
} from "pdf-lib";

import { productThumbnailUrl } from "@/lib/images/product-thumbnail-url";

type Paper = "a4" | "100x150" | "80mm" | "58mm";

type Block = {
    height: number;
    draw: (page: PDFPage, top: number) => void;
};

const mm = (value: number) => value * 72 / 25.4;

const fontFiles = new Map<string, Promise<ArrayBuffer>>();

async function readFile(url: string): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error("PDF-ის საჭირო ფაილი ვერ ჩაიტვირთა.");
        }

        return await response.arrayBuffer();
    } finally {
        clearTimeout(timeout);
    }
}

function readFont(url: string) {
    let pending = fontFiles.get(url);

    if (!pending) {
        pending = readFile(url).catch(error => {
            fontFiles.delete(url);
            throw error;
        });
        fontFiles.set(url, pending);
    }

    return pending;
}

async function logoPng(url: string): Promise<Uint8Array> {
    const bytes = await readFile(url);
    const objectUrl = URL.createObjectURL(new Blob([bytes]));
    const image = new Image();

    try {
        image.src = objectUrl;
        await image.decode();

        if (!image.naturalWidth || !image.naturalHeight) {
            throw new Error("ლოგო ვერ ჩაიტვირთა.");
        }

        const scale = Math.min(
            1,
            512 / Math.max(image.naturalWidth, image.naturalHeight),
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(
            1,
            Math.round(image.naturalWidth * scale),
        );
        canvas.height = Math.max(
            1,
            Math.round(image.naturalHeight * scale),
        );

        const context = canvas.getContext("2d");
        if (!context) throw new Error("ლოგოს მომზადება ვერ მოხერხდა.");

        context.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height,
        );

        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(result => {
                if (result) resolve(result);
                else reject(new Error("ლოგოს მომზადება ვერ მოხერხდა."));
            }, "image/png");
        });

        return new Uint8Array(await blob.arrayBuffer());
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

// Font instances belong to one PDF. Weak keys let all measured strings go when
// that document is released; cache exact shaped widths, never approximations.
const textWidths = new WeakMap<PDFFont, Map<number, Map<string, number>>>();

function textWidth(font: PDFFont, value: string, size: number): number {
    let sizes = textWidths.get(font);
    if (!sizes) { sizes = new Map(); textWidths.set(font, sizes); }
    let widths = sizes.get(size);
    if (!widths) { widths = new Map(); sizes.set(size, widths); }
    const cached = widths.get(value);
    if (cached !== undefined) return cached;
    const width = font.widthOfTextAtSize(value, size);
    // Bound memory even for unusually long or varied invoice text.
    if (widths.size >= 4096) widths.clear();
    widths.set(value, width);
    return width;
}

function wrap(
    value: string,
    font: PDFFont,
    size: number,
    width: number,
): string[] {
    const lines: string[] = [];

    for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
        let line = "";

        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const candidate = line ? `${line} ${word}` : word;

            if (textWidth(font, candidate, size) <= width) {
                line = candidate;
                continue;
            }

            if (line) {
                lines.push(line);
                line = "";
            }

            // A word that fits on an empty line needs no character-by-character
            // shaping. The overflow case below keeps the previous split rules.
            if (textWidth(font, word, size) <= width) {
                line = word;
                continue;
            }

            for (const character of word) {
                const next = line + character;

                if (
                    line &&
                    textWidth(font, next, size) > width
                ) {
                    lines.push(line);
                    line = character;
                } else {
                    line = next;
                }
            }
        }

        lines.push(line);
    }

    return lines;
}

export async function createInvoicePdf(
    invoice: OrderInvoiceData,
    paper: Paper,
): Promise<Blob> {
    // Independent assets can load together; do not wait for the PDF libraries
    // before starting fonts, or for fonts before starting the business logo.
    const [{ PDFDocument, rgb }, { default: fontkit }, regularBytes, boldBytes, logoBytes] =
        await Promise.all([
            import("pdf-lib"),
            import("@pdf-lib/fontkit"),
            readFont("/fonts/FiraGO-Regular.otf"),
            readFont("/fonts/FiraGO-SemiBold.otf"),
            invoice.business.logoUrl ? logoPng(invoice.business.logoUrl) : null,
        ]);

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);

    const regular = await pdf.embedFont(regularBytes);
    const bold = await pdf.embedFont(boldBytes);

    const thermal = paper === "58mm" || paper === "80mm";
    const pageWidth = mm(
        paper === "a4"
            ? 210
            : paper === "100x150"
                ? 100
                : paper === "80mm"
                    ? 80
                    : 58,
    );
    const margin = mm(paper === "a4" ? 12 : 3);
    const contentWidth = pageWidth - margin * 2;
    const size = paper === "a4" ? 9 : paper === "58mm" ? 8 : 9;
    const ink = rgb(0.07, 0.07, 0.07);
    const blocks: Block[] = [];
    let lastYield = performance.now();
    async function yieldToBrowser() {
        const scheduler = (globalThis as typeof globalThis & {
            scheduler?: { yield?: () => Promise<void> };
        }).scheduler;
        if (scheduler?.yield) await scheduler.yield();
        else await new Promise<void>(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
    }

    function gap(height = 6) {
        blocks.push({ height, draw: () => { } });
    }

    function text(
        value: string,
        strong = false,
        textSize = size,
    ) {
        const font = strong ? bold : regular;

        for (const line of wrap(
            value,
            font,
            textSize,
            contentWidth,
        )) {
            blocks.push({
                height: textSize * 1.5,
                draw(page, top) {
                    page.drawText(line, {
                        x: margin,
                        y: top - textSize,
                        size: textSize,
                        font,
                        color: ink,
                    });
                },
            });
        }
    }

    function rule() {
        blocks.push({
            height: 10,
            draw(page, top) {
                page.drawLine({
                    start: { x: margin, y: top - 5 },
                    end: {
                        x: pageWidth - margin,
                        y: top - 5,
                    },
                    thickness: 0.5,
                    color: rgb(0.75, 0.75, 0.75),
                });
            },
        });
    }

    function row(
        values: string[],
        strong = false,
        photo?: PDFImage | null,
    ) {
        const font = strong ? bold : regular;
        const proportions = [0.46, 0.12, 0.20, 0.22];
        const photoSize = paper === "a4" ? 28 : 22;
        const photoSpace = photo ? photoSize + 6 : 0;

        const cells = values.map((value, index) =>
            wrap(
                value,
                font,
                size,
                Math.max(
                    10,
                    contentWidth * proportions[index] -
                    5 -
                    (index === 0 ? photoSpace : 0),
                ),
            ),
        );

        const lineHeight = size * 1.5;
        const count = Math.max(...cells.map(cell => cell.length));

        // ფოტო და ტექსტის პირველი ხაზები ერთ გვერდზე რჩება.
        const firstLineCount = photo
            ? Math.min(count, Math.ceil(photoSize / lineHeight))
            : 1;

        function drawLines(
            page: PDFPage,
            top: number,
            start: number,
            length: number,
        ) {
            for (let line = start; line < start + length; line++) {
                let x = margin;

                cells.forEach((cell, index) => {
                    const value = cell[line] ?? "";
                    const width = contentWidth * proportions[index];

                    page.drawText(value, {
                        x: index >= 2
                            ? x + width - textWidth(font, value, size)
                            : x + (index === 0 ? photoSpace : 0),
                        y: top - (line - start) * lineHeight - size,
                        font,
                        size,
                        color: ink,
                    });

                    x += width;
                });
            }
        }

        blocks.push({
            height: Math.max(
                firstLineCount * lineHeight,
                photo ? photoSize : 0,
            ),
            draw(page, top) {
                if (photo) {
                    const scale =
                        photoSize / Math.max(photo.width, photo.height);
                    const width = photo.width * scale;
                    const height = photo.height * scale;

                    page.drawImage(photo, {
                        x: margin + (photoSize - width) / 2,
                        y: top - height,
                        width,
                        height,
                    });
                }

                drawLines(page, top, 0, firstLineCount);
            },
        });

        for (let line = firstLineCount; line < count; line++) {
            const lineIndex = line;

            blocks.push({
                height: lineHeight,
                draw(page, top) {
                    drawLines(page, top, lineIndex, 1);
                },
            });
        }
    }

    if (logoBytes) {
        const logo = await pdf.embedPng(logoBytes);
        const scale = 32 / Math.max(logo.width, logo.height);
        const width = logo.width * scale;
        const height = logo.height * scale;

        blocks.push({
            height: 38,
            draw(page, top) {
                page.drawImage(logo, {
                    x: margin,
                    y: top - height,
                    width,
                    height,
                });
            },
        });
    }

    text(invoice.business.name, true, size + 4);

    const contacts = [
        invoice.business.phone,
        invoice.business.email,
        invoice.business.address,
    ].filter(Boolean).join(" · ");

    if (contacts) text(contacts, false, size - 1);

    gap();

    const number = invoice.number === null
        ? ""
        : ` #${String(invoice.number).padStart(4, "0")}`;

    text(`ინვოისი${number}`, true);

    text(new Intl.DateTimeFormat("ka-GE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tbilisi",
    }).format(new Date(invoice.createdAt)));

    rule();

    if (paper === "a4") {
        // აქამდე აგებული ვერტიკალური ჰედერი იცვლება
        // პრევიუს მსგავსი ჰორიზონტალური ჰედერით.
        blocks.length = 0;

        const logo = logoBytes
            ? await pdf.embedPng(logoBytes)
            : null;

        const logoSize = 36;
        const brandX = margin + (logo ? logoSize + 9 : 0);
        const headingWidth = 150;
        const brandWidth =
            contentWidth - headingWidth - 16 -
            (logo ? logoSize + 9 : 0);

        const brandLines = wrap(
            invoice.business.name,
            bold,
            13.5,
            brandWidth,
        );

        const contactLines = contacts
            ? wrap(contacts, regular, 7.5, brandWidth)
            : [];

        const invoiceDate = new Intl.DateTimeFormat("ka-GE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Asia/Tbilisi",
        }).format(new Date(invoice.createdAt));

        const brandHeight =
            brandLines.length * 20.25 +
            contactLines.length * 11.25;

        const headerHeight =
            Math.max(logo ? logoSize : 0, brandHeight, 27) + 11;

        blocks.push({
            height: headerHeight,
            draw(page, top) {
                if (logo) {
                    const scale =
                        logoSize / Math.max(logo.width, logo.height);

                    page.drawImage(logo, {
                        x: margin,
                        y: top - logo.height * scale,
                        width: logo.width * scale,
                        height: logo.height * scale,
                    });
                }

                let brandTop = top;

                for (const line of brandLines) {
                    page.drawText(line, {
                        x: brandX,
                        y: brandTop - 13.5,
                        size: 13.5,
                        font: bold,
                        color: ink,
                    });
                    brandTop -= 20.25;
                }

                for (const line of contactLines) {
                    page.drawText(line, {
                        x: brandX,
                        y: brandTop - 7.5,
                        size: 7.5,
                        font: regular,
                        color: rgb(0.27, 0.27, 0.27),
                    });
                    brandTop -= 11.25;
                }

                const heading = `ინვოისი${number}`;

                page.drawText(heading, {
                    x: pageWidth - margin -
                        textWidth(bold, heading, 9),
                    y: top - 9,
                    size: 9,
                    font: bold,
                    color: ink,
                });

                page.drawText(invoiceDate, {
                    x: pageWidth - margin -
                        textWidth(regular, invoiceDate, 9),
                    y: top - 22.5,
                    size: 9,
                    font: regular,
                    color: ink,
                });

                page.drawLine({
                    start: {
                        x: margin,
                        y: top - headerHeight,
                    },
                    end: {
                        x: pageWidth - margin,
                        y: top - headerHeight,
                    },
                    thickness: 0.75,
                    color: rgb(0.8, 0.8, 0.8),
                });
            },
        });

        gap(12);
    }

    text(`მიმღები: ${invoice.recipient.name || "—"}`, true);
    text(invoice.recipient.phone);
    if (invoice.recipient.address) text(invoice.recipient.address);

    const statuses = {
        PROCESSING: "მუშავდება",
        SHIPPED: "გაგზავნილი",
        COMPLETED: "დასრულებული",
        CANCELED: "გაუქმებული",
        RETURNED: "დაბრუნებული",
    };
    const payments = {
        UNPAID: "გადაუხდელი",
        PAID: "გადახდილი",
        COURIER_ONLY_PAID: "მხოლოდ კურიერის საფასურია გადახდილი",
        PARTIALLY_PAID: "ნაწილობრივ გადახდილი",
    };

    text(`${statuses[invoice.status]} · ${payments[invoice.paymentStatus]}`);

    if (invoice.notes) {
        rule();
        text("კომენტარი", true);
        text(invoice.notes);
    }

    rule();

    if (!thermal) {
        row(["პროდუქტი", "რაოდ.", "ფასი ₾", "ჯამი ₾"], true);
        rule();
    }

    const productPhotos = new Map<string, Promise<PDFImage | null>>();

    function readProductPhoto(url: string): Promise<PDFImage | null> {
        const thumbnailUrl = productThumbnailUrl(url);
        let pending = productPhotos.get(thumbnailUrl);

        if (!pending) {
            pending = logoPng(thumbnailUrl)
                .then(bytes => pdf.embedPng(bytes))
                .catch(() => null);

            productPhotos.set(thumbnailUrl, pending);
        }

        return pending;
    }

    function thermalProduct(
        name: string,
        variant: string,
        photo: PDFImage,
    ) {
        const photoSize = 20;
        const textX = margin + photoSize + 6;
        const availableWidth = contentWidth - photoSize - 6;

        const lines = [
            ...wrap(name, bold, size, availableWidth).map(value => ({
                value,
                font: bold,
                textSize: size,
            })),
            ...(variant
                ? wrap(variant, regular, size - 1, availableWidth).map(value => ({
                    value,
                    font: regular,
                    textSize: size - 1,
                }))
                : []),
        ];

        const lineHeight = size * 1.5;
        const firstLineCount = Math.min(
            lines.length,
            Math.ceil(photoSize / lineHeight),
        );

        function drawLine(page: PDFPage, top: number, index: number) {
            const line = lines[index];

            page.drawText(line.value, {
                x: textX,
                y: top - line.textSize,
                font: line.font,
                size: line.textSize,
                color: ink,
            });
        }

        blocks.push({
            height: Math.max(photoSize, firstLineCount * lineHeight),
            draw(page, top) {
                const scale =
                    photoSize / Math.max(photo.width, photo.height);
                const width = photo.width * scale;
                const height = photo.height * scale;

                page.drawImage(photo, {
                    x: margin + (photoSize - width) / 2,
                    y: top - height,
                    width,
                    height,
                });

                for (let index = 0; index < firstLineCount; index++) {
                    drawLine(page, top - index * lineHeight, index);
                }
            },
        });

        for (let index = firstLineCount; index < lines.length; index++) {
            const lineIndex = index;

            blocks.push({
                height: lineHeight,
                draw(page, top) {
                    drawLine(page, top, lineIndex);
                },
            });
        }
    }

    for (const item of invoice.items) {
        if (performance.now() - lastYield >= 12) await yieldToBrowser();
        const variant = [
            item.color,
            item.size,
            item.condition === "DEFECTIVE" ? "წუნდებული" : null,
        ].filter(Boolean).join(" · ");

        const photo = item.imageUrl
            ? await readProductPhoto(item.imageUrl)
            : null;

        if (thermal) {
            if (photo) {
                thermalProduct(item.name, variant, photo);
            } else {
                text(item.name, true);
                if (variant) text(variant, false, size - 1);
            }

            text(
                `${item.quantity} × ${item.unitPrice} ₾ = ${item.total} ₾`,
            );
        } else {
            row(
                [
                    [item.name, variant].filter(Boolean).join("\n"),
                    String(item.quantity),
                    item.unitPrice,
                    item.total,
                ],
                false,
                photo,
            );
        }

        rule();
    }

    const totals = [
        ["პროდუქტები", invoice.productsTotal],
        ["მიწოდება", invoice.courierFee],
        ["სულ", invoice.total],
        ["გადახდილი", invoice.paidAmount],
        ["დარჩენილი", invoice.remainingAmount],
        ...(Number(invoice.refundDue) > 0
            ? [["დასაბრუნებელი", invoice.refundDue]]
            : []),
    ];

    if (paper === "a4") {
        const qr = invoice.qrDataUrl
            ? await pdf.embedPng(invoice.qrDataUrl)
            : null;

        const totalsWidth = 195;
        const totalsX = pageWidth - margin - totalsWidth;
        const qrSize = mm(32);
        const qrCaption = "შეკვეთის დეტალების ნახვა";

        const totalRows = totals.map(([label, value]) => {
            const strong = label === "სულ";
            const font = strong ? bold : regular;
            const fontSize = strong ? 11.25 : 9;
            const valueText = `${value} ₾`;
            const valueWidth = textWidth(font, valueText, fontSize);

            const lines = wrap(
                label,
                font,
                fontSize,
                Math.max(20, totalsWidth - valueWidth - 9),
            );

            return {
                strong,
                font,
                fontSize,
                valueText,
                valueWidth,
                lines,
                height:
                    lines.length * fontSize * 1.5 +
                    (strong ? 10 : 4),
            };
        });

        const totalsHeight = totalRows.reduce(
            (sum, row) => sum + row.height,
            0,
        );

        const bottomHeight = Math.max(
            totalsHeight,
            qr ? qrSize + 16 : 0,
        );

        gap(13.5);

        blocks.push({
            height: bottomHeight,
            draw(page, top) {
                if (qr) {
                    page.drawImage(qr, {
                        x: margin,
                        y: top - qrSize,
                        width: qrSize,
                        height: qrSize,
                    });

                    page.drawText(qrCaption, {
                        x: margin + (
                            qrSize -
                            textWidth(regular, qrCaption, 7.5)
                        ) / 2,
                        y: top - qrSize - 11,
                        size: 7.5,
                        font: regular,
                        color: ink,
                    });
                }

                let rowTop = top;

                for (const row of totalRows) {
                    if (row.strong) {
                        page.drawLine({
                            start: { x: totalsX, y: rowTop },
                            end: {
                                x: pageWidth - margin,
                                y: rowTop,
                            },
                            thickness: 0.75,
                            color: rgb(0.75, 0.75, 0.75),
                        });

                        rowTop -= 6;
                    }

                    row.lines.forEach((line, index) => {
                        page.drawText(line, {
                            x: totalsX,
                            y: rowTop - row.fontSize -
                                index * row.fontSize * 1.5,
                            size: row.fontSize,
                            font: row.font,
                            color: ink,
                        });
                    });

                    page.drawText(row.valueText, {
                        x: pageWidth - margin - row.valueWidth,
                        y: rowTop - row.fontSize,
                        size: row.fontSize,
                        font: row.font,
                        color: ink,
                    });

                    rowTop -= row.height -
                        (row.strong ? 6 : 0);
                }
            },
        });

        gap(10.5);

        const footer = "შექმნილია MARTEO-ს დახმარებით";

        blocks.push({
            height: 12,
            draw(page, top) {
                page.drawText(footer, {
                    x: margin + (
                        contentWidth -
                        textWidth(regular, footer, 7.5)
                    ) / 2,
                    y: top - 7.5,
                    size: 7.5,
                    font: regular,
                    color: rgb(0.27, 0.27, 0.27),
                });
            },
        });
    } else {
        for (const [label, value] of totals) {
            text(`${label}: ${value} ₾`, label === "სულ");
        }

        if (invoice.qrDataUrl) {
            gap(10);

            const qr = await pdf.embedPng(invoice.qrDataUrl);
            const qrSize = Math.min(mm(28), contentWidth);

            blocks.push({
                height: qrSize + 6,
                draw(page, top) {
                    page.drawImage(qr, {
                        x: margin,
                        y: top - qrSize,
                        width: qrSize,
                        height: qrSize,
                    });
                },
            });

            text("შეკვეთის დეტალების ნახვა", false, size - 1);
        }

        gap();
        text("შექმნილია MARTEO-ს დახმარებით", false, size - 1);
    }

    const totalHeight =
        blocks.reduce((sum, block) => sum + block.height, 0) +
        margin * 2;

    const pageHeight = paper === "a4"
        ? mm(297)
        : paper === "100x150"
            ? mm(150)
            : Math.min(mm(1000), Math.max(mm(50), totalHeight));

    let page = pdf.addPage([pageWidth, pageHeight]);
    let top = pageHeight - margin;

    for (const block of blocks) {
        if (performance.now() - lastYield >= 12) await yieldToBrowser();
        if (top - block.height < margin) {
            page = pdf.addPage([pageWidth, pageHeight]);
            top = pageHeight - margin;
        }

        block.draw(page, top);
        top -= block.height;
    }

    pdf.setTitle(`Marteo — ინვოისი${number}`);
    pdf.setCreator("Marteo");

    const bytes = await pdf.save({ objectsPerTick: 10 });

    return new Blob(
        [new Uint8Array(bytes).buffer],
        { type: "application/pdf" },
    );
}
