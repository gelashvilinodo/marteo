"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { prepareOrderPhoto } from "@/lib/orders/prepare-order-photo";

export default function OrderPhotoUpload({
    imageUrl,
    onChange,
    onBusyChange,
}: {
    imageUrl: string | null;
    onChange: (url: string | null) => void;
    onBusyChange: (busy: boolean) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const controller = useRef<AbortController | null>(null);
    const running = useRef(false);
    const mounted = useRef(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [stage, setStage] = useState("");
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; controller.current?.abort(); };
    }, []);

    async function upload(file: File) {
        if (running.current) return;
        running.current = true;
        setBusy(true);
        onBusyChange(true);
        setError("");
        setStage("ფოტო მუშავდება…");
        const abort = new AbortController();
        controller.current = abort;
        try {
            const prepared = await prepareOrderPhoto(file);
            if (abort.signal.aborted || !mounted.current) return;
            setStage("ფოტო იტვირთება…");
            const form = new FormData();
            form.set("file", prepared);
            const response = await fetch("/api/orders/photos", {
                method: "POST",
                body: form,
                signal: abort.signal,
            });
            const result = await response.json() as { success?: boolean; imageUrl?: string; message?: string };
            if (!response.ok || !result.success || !result.imageUrl) {
                throw new Error(result.message || "ფოტო ვერ აიტვირთა. სცადე ხელახლა.");
            }
            if (mounted.current && !abort.signal.aborted) onChange(result.imageUrl);
        } catch (cause: unknown) {
            if (mounted.current && !abort.signal.aborted) {
                setError(cause instanceof Error ? cause.message : "ფოტო ვერ აიტვირთა.");
            }
        } finally {
            running.current = false;
            if (mounted.current) {
                setBusy(false);
                onBusyChange(false);
            }
        }
    }
    return <div className="mb-3">
        <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="პროდუქტის ფოტოს არჩევა"
            onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
            }}
        />
        <div className="flex flex-wrap items-center gap-2">
            {busy && <button type="button" onClick={() => controller.current?.abort()} className="min-h-10 px-2 text-xs text-text-secondary underline">ატვირთვის შეწყვეტა</button>}
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent/30 px-3 text-sm text-accent disabled:opacity-50">
                <Icon icon={busy ? "solar:refresh-linear" : "solar:camera-add-linear"} className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
                {busy ? stage : imageUrl ? "ფოტოს შეცვლა" : "ფოტოს დამატება"}
            </button>
            {imageUrl && !busy && <button type="button" onClick={() => { onChange(null); setError(""); }} className="min-h-10 px-2 text-xs text-danger">ფოტოს მოხსნა</button>}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        {!busy && !error && imageUrl && <p role="status" className="mt-2 text-xs text-success">ფოტო ატვირთულია.</p>}
    </div>;
}
