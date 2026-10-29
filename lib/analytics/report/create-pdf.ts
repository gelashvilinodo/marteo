import type { PDFFont, PDFPage } from 'pdf-lib';
import type { AccountantReport } from './types';
export async function createAccountantPdf(data: AccountantReport, suppliedFonts?: { regular: Uint8Array; bold: Uint8Array }): Promise<Blob> {
    const [{ PDFDocument, rgb }, fontkit] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
    const loadFont = async (name: string) => { const r = await fetch('/fonts/FiraGO-' + name + '.otf', { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('ქართული შრიფტი ვერ ჩაიტვირთა.'); return new Uint8Array(await r.arrayBuffer()); };
    const bytes = suppliedFonts ?? { regular: await loadFont('Regular'), bold: await loadFont('Bold') };
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit.default ?? fontkit);
    const regular = await pdf.embedFont(bytes.regular, { subset: false }), bold = await pdf.embedFont(bytes.bold, { subset: false });
    pdf.setTitle('ბიზნესის ანგარიში'); pdf.setAuthor(data.businessName);
    const W = 595.2756, H = 841.8898, M = 32, width = W - 2 * M;
    let page: PDFPage, y = M;
    function wrap(value: string, font: PDFFont, size: number, max: number) {
        const lines: string[] = []; let line = '';
        for (const char of value.replace(/[\u0000-\u0008\u000b-\u001f]/g, '')) {
            if (char === '\n' || (line && font.widthOfTextAtSize(line + char, size) > max)) { lines.push(line); line = ''; }
            if (char !== '\n') line += char;
        }
        lines.push(line); return lines;
    }
    function draw(text: string, x: number, top: number, size = 8, font = regular) { page.drawText(text, { x, y: H - top - size, font, size, color: rgb(.08, .1, .13) }); }
    function newPage() { page = pdf.addPage([W, H]); y = M; for (const line of wrap(data.businessName, bold, 11, width)) { draw(line, M, y, 11, bold); y += 15; } y += 5; draw('ბიზნესის ანგარიში · ' + data.from + ' - ' + data.to, M, y, 10, bold); y += 24; }
    function paragraph(value: string, size = 8, font = regular) { for (const line of wrap(value, font, size, width)) { if (y + size + 5 > H - 36) newPage(); draw(line, M, y, size, font); y += size + 5; } y += 5; }
    newPage(); paragraph('მომზადებულია: ' + new Intl.DateTimeFormat('ka-GE', { timeZone: 'Asia/Tbilisi', dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.createdAt)), 7);
    for (const h of data.highlights) { paragraph(h.label + ': ' + h.value, 11, bold); paragraph(h.description, 8); }
    for (const warning of data.warnings) paragraph(warning, 8);
    for (const section of data.sections) {
        if (y > H - 150) newPage(); paragraph(section.title, 11, bold); if (section.note) paragraph(section.note, 7);
        const columns = section.columns.length, colWidth = width / columns;
        const row = (values: string[], heading = false) => {
            const all = values.map(v => wrap(v, heading ? bold : regular, 8, colWidth - 10));
            let offset = 0; const count = Math.max(...all.map(a => a.length));
            while (offset < count) {
                if (y > H - 74) { newPage(); if (!heading) row(section.columns, true); }
                const length = Math.min(count - offset, Math.max(1, Math.floor((H - 42 - y - 10) / 12))), height = length * 12 + 10;
                values.forEach((_, i) => {
                    page.drawRectangle({ x: M + i * colWidth, y: H - y - height, width: colWidth, height, borderWidth: .4, borderColor: rgb(.72, .75, .8), ...(heading ? { color: rgb(.94, .95, .97) } : {}) });
                    all[i].slice(offset, offset + length).forEach((line, j) => draw(line, M + i * colWidth + 5, y + 5 + j * 12, 8, heading ? bold : regular));
                });
                y += height; offset += length;
            }
        };
        row(section.columns, true); for (const values of section.rows) row(values);
        if (!section.rows.length) paragraph('ამ პერიოდში ჩანაწერი არ არის.', 8); y += 18;
    }
    paragraph('პასუხისმგებელი პირი: ____________________   ხელმოწერა: ____________________', 8);
    pdf.getPages().forEach((p, i, pages) => p.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 40, y: 18, font: regular, size: 8 }));
    return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
