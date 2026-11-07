import { quantityLabel } from "@/lib/orders/quantity";
import type { OrderInvoiceData } from "./invoice-types";
import type {
    Color,
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

type Run = { text: string; font: PDFFont; color?: Color };
type Piece = { text: string; font: PDFFont; color?: Color; dx: number };
type Line = { pieces: Piece[]; width: number };
type Align = "left" | "center" | "right";

const mm = (value: number) => value * 72 / 25.4;
// ინვოისის პრევიუ CSS პიქსელებშია აწყობილი; 1px = 0.75pt.
const px = (value: number) => value * 0.75;

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

// cover=true ჭრის კვადრატად ცენტრიდან, როგორც პრევიუს object-fit:cover.
async function imagePng(url: string, cover = false): Promise<Uint8Array> {
    const bytes = await readFile(url);
    const objectUrl = URL.createObjectURL(new Blob([bytes]));
    const image = new Image();

    try {
        image.src = objectUrl;
        await image.decode();

        if (!image.naturalWidth || !image.naturalHeight) {
            throw new Error("სურათი ვერ ჩაიტვირთა.");
        }

        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceWidth = cover ? side : image.naturalWidth;
        const sourceHeight = cover ? side : image.naturalHeight;
        const scale = Math.min(
            1,
            512 / Math.max(sourceWidth, sourceHeight),
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));

        const context = canvas.getContext("2d");
        if (!context) throw new Error("სურათის მომზადება ვერ მოხერხდა.");

        if (cover) {
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }

        context.drawImage(
            image,
            (image.naturalWidth - sourceWidth) / 2,
            (image.naturalHeight - sourceHeight) / 2,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width,
            canvas.height,
        );

        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(result => {
                if (result) resolve(result);
                else reject(new Error("სურათის მომზადება ვერ მოხერხდა."));
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

// სტრიქონებად დაყოფა, სადაც ერთ ხაზზე სხვადასხვა შრიფტი შეიძლება იყოს
// (მაგ. მუქი "მიმღები:" და ჩვეულებრივი სახელი).
function layoutRuns(runs: Run[], size: number, width: number): Line[] {
    type Word = { text: string; font: PDFFont; color?: Color; space: boolean; br: boolean };
    const words: Word[] = [];
    let space = false;
    let br = false;

    for (const run of runs) {
        const parts = run.text.replace(/\r\n?/g, "\n").split(/(\s+)/);
        for (const part of parts) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
                space = true;
                if (part.includes("\n")) br = true;
                continue;
            }
            words.push({ text: part, font: run.font, color: run.color, space, br });
            space = false;
            br = false;
        }
    }

    const lines: Line[] = [];
    let current: Line = { pieces: [], width: 0 };

    const flush = () => {
        lines.push(current);
        current = { pieces: [], width: 0 };
    };

    for (const word of words) {
        if (word.br && current.pieces.length) flush();

        const wordWidth = textWidth(word.font, word.text, size);
        const spaceWidth = word.space ? textWidth(word.font, " ", size) : 0;

        if (current.pieces.length && current.width + spaceWidth + wordWidth > width) {
            flush();
        }

        const lead = current.pieces.length ? spaceWidth : 0;

        if (wordWidth <= width - current.width - lead) {
            current.pieces.push({ text: word.text, font: word.font, color: word.color, dx: current.width + lead });
            current.width += lead + wordWidth;
            continue;
        }

        // სიტყვა ხაზზე არ ეტევა: სიმბოლოებად იყოფა.
        let chunk = "";
        for (const character of word.text) {
            const next = chunk + character;
            if (chunk && current.width + textWidth(word.font, next, size) > width) {
                current.pieces.push({ text: chunk, font: word.font, color: word.color, dx: current.width });
                current.width += textWidth(word.font, chunk, size);
                flush();
                chunk = character;
            } else {
                chunk = next;
            }
        }
        if (chunk) {
            current.pieces.push({ text: chunk, font: word.font, color: word.color, dx: current.width });
            current.width += textWidth(word.font, chunk, size);
        }
    }

    if (current.pieces.length || !lines.length) flush();
    return lines;
}

const statuses = {
    PROCESSING: "მუშავდება",
    SHIPPED: "გაგზავნილი",
    COMPLETED: "დასრულებული",
    CANCELED: "გაუქმებული",
    RETURNED: "დაბრუნებული",
};
const payments = {
    UNKNOWN: "გადახდა დაუზუსტებელია",
    UNPAID: "გადასახდელი",
    PAID: "გადახდილი",
    COURIER_ONLY_PAID: "მხოლოდ კურიერის საფასურია გადახდილი",
    PARTIALLY_PAID: "ნაწილობრივ გადახდილი",
};

function invoiceDate(value: string) {
    const d = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

// ზომები InvoiceDocument-ის CSS-იდანაა (px), რომ PDF პრევიუს დაემთხვეს.
const layouts = {
    a4: { base: 12, lh: 1.5, logo: 56, brandGap: 12, name: 18, contact: 10, heading: 12, topGap: 16, topPad: 14, recipient: 16, th: 7, td: 9, photo: 36, bottomMargin: 18, bottomGap: 20, qr: 32, qrCaptionMax: Infinity, qrCaption: 10, totalsMax: px(260), rowGap: 5, paid: 15, footerMargin: 14, footer: 10 },
    "100x150": { base: 11, lh: 1.4, logo: 32, brandGap: 6, name: 14, contact: 9, heading: 10, topGap: 8, topPad: 8, recipient: 8, th: 5, td: 6, photo: 28, bottomMargin: 10, bottomGap: 8, qr: 24, qrCaptionMax: mm(26), qrCaption: 9, totalsMax: mm(60), rowGap: 3, paid: 13, footerMargin: 8, footer: 9 },
    "80mm": { base: 11, lh: 1.5, logo: 32, brandGap: 0, name: 14, contact: 10, heading: 11, topGap: 0, topPad: 8, recipient: 10, th: 0, td: 0, photo: 24, bottomMargin: 10, bottomGap: 10, qr: 32, qrCaptionMax: Infinity, qrCaption: 10, totalsMax: Infinity, rowGap: 5, paid: 15, footerMargin: 14, footer: 10 },
    "58mm": { base: 10, lh: 1.5, logo: 32, brandGap: 0, name: 14, contact: 10, heading: 10, topGap: 0, topPad: 8, recipient: 10, th: 0, td: 0, photo: 24, bottomMargin: 10, bottomGap: 10, qr: 32, qrCaptionMax: Infinity, qrCaption: 10, totalsMax: Infinity, rowGap: 5, paid: 15, footerMargin: 14, footer: 10 },
} satisfies Record<Paper, Record<string, number>>;

export async function createInvoicePdf(
    invoice: OrderInvoiceData,
    paper: Paper,
): Promise<Blob> {
    // Independent assets can load together; do not wait for the PDF libraries
    // before starting fonts, or for fonts before starting the business logo.
    const [{ PDFDocument, rgb }, { default: fontkit }, regularBytes, semiboldBytes, logoBytes] =
        await Promise.all([
            import("pdf-lib"),
            import("@pdf-lib/fontkit"),
            readFont("/fonts/FiraGO-Regular.otf"),
            readFont("/fonts/FiraGO-SemiBold.otf"),
            invoice.business.logoUrl ? imagePng(invoice.business.logoUrl) : null,
        ]);

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);

    // შრიფტები მთლიანად ჩაიდება: subset-ის შემთხვევაში iPhone/macOS ასოებს
    // ვერ აჩვენებს. PDF-ის ზომის გამო მხოლოდ ორი სისქეა, პრევიუს 500/600/700
    // სისქეები SemiBold-ით იცვლება.
    const regular = await pdf.embedFont(regularBytes);
    const semibold = await pdf.embedFont(semiboldBytes);
    const medium = semibold;
    const bold = semibold;

    const thermal = paper === "58mm" || paper === "80mm";
    const config = layouts[paper];
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
    const right = margin + contentWidth;
    const size = px(config.base);
    const small = px(10);
    const lineHeight = (textSize: number) => textSize * config.lh;
    const ink = rgb(0.07, 0.07, 0.07);
    const gray = rgb(0.27, 0.27, 0.27);
    const border = rgb(0.8, 0.8, 0.8);
    const borderMid = rgb(0.73, 0.73, 0.73);
    const borderLight = rgb(0.87, 0.87, 0.87);
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

    // ტექსტის ბაზისი ხაზის ცენტრში, როგორც CSS line-height.
    function drawLine(
        page: PDFPage,
        line: Line,
        textSize: number,
        x: number,
        width: number,
        top: number,
        align: Align = "left",
        color: Color = ink,
    ) {
        const start = align === "center"
            ? x + (width - line.width) / 2
            : align === "right"
                ? x + width - line.width
                : x;
        const baseline = top - lineHeight(textSize) / 2 - textSize * 0.35;

        for (const piece of line.pieces) {
            page.drawText(piece.text, {
                x: start + piece.dx,
                y: baseline,
                size: textSize,
                font: piece.font,
                color: piece.color ?? color,
            });
        }
    }

    function drawLines(
        page: PDFPage,
        lines: Line[],
        textSize: number,
        x: number,
        width: number,
        top: number,
        align: Align = "left",
        color: Color = ink,
    ) {
        lines.forEach((line, index) => {
            drawLine(page, line, textSize, x, width, top - index * lineHeight(textSize), align, color);
        });
        return lines.length * lineHeight(textSize);
    }

    function single(text: string, font: PDFFont, textSize: number) {
        return layoutRuns([{ text, font }], textSize, Infinity)[0];
    }

    function gap(height: number) {
        if (height > 0) blocks.push({ height, draw: () => { } });
    }

    function paragraph(
        runs: Run[],
        textSize = size,
        align: Align = "left",
        color: Color = ink,
    ) {
        for (const line of layoutRuns(runs, textSize, contentWidth)) {
            blocks.push({
                height: lineHeight(textSize),
                draw(page, top) {
                    drawLine(page, line, textSize, margin, contentWidth, top, align, color);
                },
            });
        }
    }

    function hr(color: Color, dashed = false, x = margin, width = contentWidth) {
        return (page: PDFPage, y: number) => {
            page.drawLine({
                start: { x, y },
                end: { x: x + width, y },
                thickness: 0.75,
                color,
                ...(dashed ? { dashArray: [3, 2] } : {}),
            });
        };
    }

    function rule(color: Color, dashed = false) {
        const draw = hr(color, dashed);
        blocks.push({ height: 0.75, draw: (page, top) => draw(page, top - 0.375) });
    }

    function drawImageFit(page: PDFPage, image: PDFImage, x: number, top: number, box: number) {
        const scale = box / Math.max(image.width, image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, {
            x: x + (box - width) / 2,
            y: top - (box + height) / 2,
            width,
            height,
        });
    }

    function drawPhoto(page: PDFPage, photo: PDFImage, x: number, top: number, box: number) {
        page.drawImage(photo, { x, y: top - box, width: box, height: box });
        page.drawRectangle({
            x,
            y: top - box,
            width: box,
            height: box,
            borderColor: borderLight,
            borderWidth: 0.75,
        });
    }

    const number = invoice.number === null
        ? ""
        : ` #${String(invoice.number).padStart(4, "0")}`;
    const heading = `ინვოისი${number}`;
    const dateText = invoiceDate(invoice.createdAt);
    const contacts = [
        invoice.business.phone,
        invoice.business.email,
        invoice.business.address,
    ].filter(Boolean).join(" · ");
    const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;

    // ---- ჰედერი ----
    const logoSize = px(config.logo);
    const nameSize = px(config.name);
    const contactSize = px(config.contact);
    const headingSize = px(config.heading);

    if (thermal) {
        if (logo) {
            blocks.push({
                height: logoSize + px(5),
                draw(page, top) {
                    drawImageFit(page, logo, margin + (contentWidth - logoSize) / 2, top, logoSize);
                },
            });
        }
        paragraph([{ text: invoice.business.name, font: semibold }], nameSize, "center");
        if (contacts) paragraph([{ text: contacts, font: regular }], contactSize, "center", gray);
        gap(px(6));
        paragraph([{ text: heading, font: semibold }], headingSize, "center");
        paragraph([{ text: dateText, font: regular }], headingSize, "center");
        gap(px(config.topPad));
        rule(border);
    } else {
        const headingWidth = Math.max(
            textWidth(semibold, heading, headingSize),
            textWidth(regular, dateText, headingSize),
        );
        const brandOffset = logo ? logoSize + px(config.brandGap) : 0;
        const brandWidth = Math.max(
            40,
            contentWidth - headingWidth - px(config.topGap) - brandOffset,
        );
        const nameLines = layoutRuns([{ text: invoice.business.name, font: semibold }], nameSize, brandWidth);
        const contactLines = contacts
            ? layoutRuns([{ text: contacts, font: regular }], contactSize, brandWidth)
            : [];
        const brandTextHeight =
            nameLines.length * lineHeight(nameSize) +
            contactLines.length * lineHeight(contactSize);
        const brandHeight = Math.max(logo ? logoSize : 0, brandTextHeight);
        const headingHeight = lineHeight(headingSize) * 2;
        const contentHeight = Math.max(brandHeight, headingHeight);
        const line = hr(border);

        blocks.push({
            height: contentHeight + px(config.topPad) + 0.75,
            draw(page, top) {
                if (logo) drawImageFit(page, logo, margin, top - (brandHeight - logoSize) / 2, logoSize);

                let textTop = top - (brandHeight - brandTextHeight) / 2;
                textTop -= drawLines(page, nameLines, nameSize, margin + brandOffset, brandWidth, textTop);
                drawLines(page, contactLines, contactSize, margin + brandOffset, brandWidth, textTop, "left", gray);

                drawLine(page, single(heading, semibold, headingSize), headingSize, margin, contentWidth, top, "right");
                drawLine(page, single(dateText, regular, headingSize), headingSize, margin, contentWidth, top - lineHeight(headingSize), "right");

                line(page, top - contentHeight - px(config.topPad) - 0.375);
            },
        });
    }

    // ---- მიმღები ----
    const fullyPaid =
        invoice.paymentStatus === "PAID" &&
        Number(invoice.remainingAmount) === 0;

    gap(px(config.recipient));
    paragraph([
        { text: "მიმღები:", font: bold },
        { text: ` ${invoice.recipient.name || "-"}`, font: regular },
    ]);
    paragraph([{ text: invoice.recipient.phone, font: regular }]);
    if (invoice.recipient.address) {
        paragraph([{ text: invoice.recipient.address, font: regular }]);
    }
    paragraph([
        { text: `${statuses[invoice.status]} · `, font: regular },
        { text: payments[invoice.paymentStatus], font: fullyPaid ? bold : regular },
    ]);
    gap(px(config.recipient));

    if (invoice.notes) {
        rule(borderMid, true);
        gap(px(8));
        paragraph([{ text: "კომენტარი", font: bold }]);
        gap(px(4));
        paragraph([{ text: invoice.notes, font: regular }]);
        gap(px(8));
        rule(borderMid, true);
        gap(px(10));
    }

    // ---- პროდუქტები ----
    const productPhotos = new Map<string, Promise<PDFImage | null>>();

    function readProductPhoto(url: string): Promise<PDFImage | null> {
        const thumbnailUrl = productThumbnailUrl(url);
        let pending = productPhotos.get(thumbnailUrl);

        if (!pending) {
            pending = imagePng(thumbnailUrl, true)
                .then(bytes => pdf.embedPng(bytes))
                .catch(() => null);

            productPhotos.set(thumbnailUrl, pending);
        }

        return pending;
    }

    const photoSize = px(config.photo);
    const photoGap = px(8);

    // პროდუქტის სახელი და ვარიანტი ფოტოს გვერდით.
    function productCopy(name: string, variant: string, width: number) {
        const nameLines = layoutRuns([{ text: name, font: medium }], size, width);
        const variantLines = variant
            ? layoutRuns([{ text: variant, font: regular }], small, width)
            : [];
        const height =
            nameLines.length * lineHeight(size) +
            (variantLines.length ? px(3) + variantLines.length * lineHeight(small) : 0);

        return {
            height,
            draw(page: PDFPage, x: number, top: number) {
                const after = top - drawLines(page, nameLines, size, x, width, top);
                drawLines(page, variantLines, small, x, width, after - px(3), "left", gray);
            },
        };
    }

    const columns = [0.46, 0.12, 0.20, 0.22].map(part => part * contentWidth);
    const columnX = columns.map((_, index) =>
        margin + columns.slice(0, index).reduce((sum, value) => sum + value, 0));

    if (!thermal) {
        const headers = ["პროდუქტი", "რაოდ.", "ფასი ₾", "ჯამი ₾"];
        const line = hr(borderMid);
        const pad = px(config.th);

        blocks.push({
            height: 0.75 + pad * 2 + lineHeight(size) + 0.75,
            draw(page, top) {
                line(page, top - 0.375);
                headers.forEach((value, index) => {
                    drawLine(
                        page,
                        single(value, bold, size),
                        size,
                        columnX[index],
                        columns[index],
                        top - 0.75 - pad,
                        index >= 2 ? "right" : "left",
                    );
                });
                line(page, top - 0.75 - pad * 2 - lineHeight(size) - 0.375);
            },
        });
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

        const quantity = item.unit && item.unit !== "PCS"
            ? quantityLabel(item.quantity, item.unit)
            : String(item.quantity);

        const textX = margin + (photo ? photoSize + photoGap : 0);

        if (thermal) {
            const pad = px(7);
            const copy = productCopy(item.name, variant, right - textX);
            const productHeight = Math.max(photo ? photoSize : 0, copy.height);
            const totalText = `${item.total} ₾`;
            const totalWidth = textWidth(bold, totalText, size);
            const priceLines = layoutRuns(
                [{ text: `${quantity} × ${item.unitPrice} ₾`, font: regular }],
                size,
                Math.max(20, contentWidth - totalWidth - px(8)),
            );
            const priceHeight = priceLines.length * lineHeight(size);
            const dashed = hr(borderMid, true);

            blocks.push({
                height: pad + productHeight + px(3) + priceHeight + pad + 0.75,
                draw(page, top) {
                    const start = top - pad;
                    if (photo) drawPhoto(page, photo, margin, start, photoSize);
                    copy.draw(page, textX, start);

                    const priceTop = start - productHeight - px(3);
                    drawLines(page, priceLines, size, margin, contentWidth, priceTop);
                    drawLine(page, single(totalText, bold, size), size, margin, contentWidth, priceTop, "right");

                    dashed(page, priceTop - priceHeight - pad - 0.375);
                },
            });
        } else {
            const pad = px(config.td);
            const copy = productCopy(item.name, variant, Math.max(20, columns[0] - (textX - margin)));
            const cells = [quantity, item.unitPrice, item.total].map((value, index) =>
                layoutRuns([{ text: value, font: regular }], size, columns[index + 1]));
            const contentHeight = Math.max(
                photo ? photoSize : 0,
                copy.height,
                ...cells.map(cell => cell.length * lineHeight(size)),
            );
            const line = hr(borderLight);

            blocks.push({
                height: pad * 2 + contentHeight + 0.75,
                draw(page, top) {
                    const start = top - pad;
                    if (photo) drawPhoto(page, photo, margin, start, photoSize);
                    copy.draw(page, textX, start);
                    cells.forEach((cell, index) => {
                        drawLines(
                            page,
                            cell,
                            size,
                            columnX[index + 1],
                            columns[index + 1],
                            start,
                            index === 0 ? "left" : "right",
                        );
                    });
                    line(page, start - contentHeight - pad - 0.375);
                },
            });
        }
    }

    // ---- ჯამები და QR ----
    const totals: [string, string][] = [
        ["პროდუქტები", invoice.productsTotal],
        ["მიწოდება", invoice.courierFee],
        ["სულ", invoice.total],
    ];
    if (invoice.paymentStatus !== "UNKNOWN") {
        totals.push(["გადახდილი", invoice.paidAmount]);
        if (Number(invoice.remainingAmount) > 0) totals.push(["დარჩენილი", invoice.remainingAmount]);
        if (Number(invoice.refundDue) > 0) totals.push(["დასაბრუნებელი", invoice.refundDue]);
    }

    const qr = invoice.qrDataUrl ? await pdf.embedPng(invoice.qrDataUrl) : null;
    const qrSize = Math.min(mm(config.qr), contentWidth);
    const qrCaptionSize = px(config.qrCaption);
    const qrCaption = "შეკვეთის დეტალების ნახვა";
    const qrColumnWidth = qr
        ? Math.min(
            contentWidth,
            Math.max(
                qrSize,
                Math.min(textWidth(regular, qrCaption, qrCaptionSize), config.qrCaptionMax),
            ),
        )
        : 0;
    const qrCaptionLines = qr
        ? layoutRuns([{ text: qrCaption, font: regular }], qrCaptionSize, qrColumnWidth)
        : [];
    const qrHeight = qr
        ? qrSize + qrCaptionLines.length * lineHeight(qrCaptionSize)
        : 0;

    function drawQr(page: PDFPage, x: number, top: number) {
        if (!qr) return;
        page.drawImage(qr, {
            x: x + (qrColumnWidth - qrSize) / 2,
            y: top - qrSize,
            width: qrSize,
            height: qrSize,
        });
        drawLines(page, qrCaptionLines, qrCaptionSize, x, qrColumnWidth, top - qrSize, "center");
    }

    const totalsWidth = thermal
        ? contentWidth
        : Math.min(
            config.totalsMax,
            contentWidth - (qr ? qrColumnWidth + px(config.bottomGap) : 0),
        );
    const totalsX = right - totalsWidth;
    const rowGap = px(config.rowGap);
    const totalRows = totals.map(([label, value]) => {
        const paid = label === "გადახდილი" && fullyPaid;
        const grand = label === "სულ";
        const font = paid ? bold : regular;
        const textSize = paid ? px(config.paid) : size;
        const valueText = `${value} ₾`;
        const valueWidth = textWidth(font, valueText, textSize);
        const lines = layoutRuns(
            [{ text: label, font }],
            textSize,
            Math.max(20, totalsWidth - valueWidth - px(12)),
        );
        const extra = grand ? 0.75 + px(7) : 0;

        return {
            grand,
            font,
            textSize,
            valueText,
            lines,
            extra,
            height: extra + lines.length * lineHeight(textSize),
        };
    });
    const totalsHeight =
        rowGap * 2 +
        totalRows.reduce((sum, row) => sum + row.height, 0) +
        rowGap * Math.max(0, totalRows.length - 1);
    const totalsLine = hr(borderMid, false, totalsX, totalsWidth);

    function drawTotals(page: PDFPage, top: number) {
        let rowTop = top - rowGap;
        for (const row of totalRows) {
            if (row.grand) totalsLine(page, rowTop - 0.375);
            const textTop = rowTop - row.extra;
            drawLines(page, row.lines, row.textSize, totalsX, totalsWidth, textTop);
            drawLine(page, single(row.valueText, row.font, row.textSize), row.textSize, totalsX, totalsWidth, textTop, "right");
            rowTop -= row.height + rowGap;
        }
    }

    gap(px(config.bottomMargin));

    if (thermal) {
        blocks.push({ height: totalsHeight, draw: drawTotals });
        if (qr) {
            gap(px(config.bottomGap));
            blocks.push({
                height: qrHeight,
                draw(page, top) {
                    drawQr(page, margin + (contentWidth - qrColumnWidth) / 2, top);
                },
            });
        }
    } else {
        blocks.push({
            height: Math.max(totalsHeight, qrHeight),
            draw(page, top) {
                drawQr(page, margin, top);
                drawTotals(page, top);
            },
        });
    }

    gap(px(config.footerMargin));
    paragraph(
        [{ text: "შექმნილია MARTEO-ს დახმარებით", font: regular }],
        px(config.footer),
        "center",
        gray,
    );

    const totalHeight =
        blocks.reduce((sum, block) => sum + block.height, 0) +
        margin * 2;

    const pageHeight = paper === "a4"
        ? mm(297)
        : paper === "100x150"
            ? mm(150)
            : Math.min(mm(1000), Math.max(mm(50), totalHeight + 1));

    let page = pdf.addPage([pageWidth, pageHeight]);
    let top = pageHeight - margin;

    for (const block of blocks) {
        if (performance.now() - lastYield >= 12) await yieldToBrowser();
        if (top - block.height < margin - 0.01) {
            page = pdf.addPage([pageWidth, pageHeight]);
            top = pageHeight - margin;
        }

        block.draw(page, top);
        top -= block.height;
    }

    pdf.setTitle(`Marteo - ${heading}`);
    pdf.setCreator("Marteo");

    const bytes = await pdf.save({ objectsPerTick: 10 });

    return new Blob(
        [new Uint8Array(bytes).buffer],
        { type: "application/pdf" },
    );
}
