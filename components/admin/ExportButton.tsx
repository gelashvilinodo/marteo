"use client";

import { Icon } from "@iconify/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

type Sheet = { sheet: string; rows: Record<string, string | number>[]; widths: number[] };

// Exports exactly what the list shows: the current search and filters are sent along.
export default function ExportButton({ kind, filename }: { kind: "users" | "businesses"; filename: string }) {
    const params = useSearchParams();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const download = async () => {
        setBusy(true);
        setError("");
        try {
            const query = new URLSearchParams(params);
            query.delete("page");
            const response = await fetch(`/api/admin/export/${kind}?${query}`, { method: "POST", cache: "no-store" });
            const data = await response.json().catch(() => ({})) as Partial<Sheet> & { message?: string };
            if (!response.ok || !data.rows || !data.sheet) throw new Error(data.message || "ექსპორტი ვერ მოხერხდა.");
            const XLSX = await import("xlsx");
            // json_to_sheet stores strings as text cells, so "=..." or "+995..." never become formulas.
            const worksheet = XLSX.utils.json_to_sheet(data.rows);
            worksheet["!cols"] = (data.widths ?? []).map(wch => ({ wch }));
            if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, data.sheet);
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(new Date());
            XLSX.writeFile(workbook, `${filename}-${day}.xlsx`, { compression: true });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ექსპორტი ვერ მოხერხდა.");
        } finally { setBusy(false); }
    };

    return <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={download} disabled={busy}
            className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text-primary transition hover:border-accent/40 hover:bg-background disabled:opacity-60">
            <Icon icon={busy ? "svg-spinners:180-ring" : "solar:file-download-linear"} className="h-5 w-5 text-success" aria-hidden="true" />
            {busy ? "მზადდება…" : "Excel-ში ჩამოტვირთვა"}
        </button>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>;
}
