"use client";

type Source = { fileId: string; fileName: string; sheet: { name: string } };
export default function ImportSelectedSheets({ sources, onDisable }: { sources: Source[]; onDisable: (fileId: string, sheetName: string) => void }) {
    return <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm">მონაცემების წყაროები ({sources.length})</summary>
        <div className="mt-3 space-y-2">{sources.map(source => <div key={JSON.stringify([source.fileId, source.sheet.name])} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="break-words">{source.fileName} / {source.sheet.name}</span>
            <button type="button" onClick={() => onDisable(source.fileId, source.sheet.name)} className="min-h-10 rounded-lg border border-border px-3 text-xs">ამ წყაროს გამოტოვება</button>
        </div>)}</div>
    </details>;
}
