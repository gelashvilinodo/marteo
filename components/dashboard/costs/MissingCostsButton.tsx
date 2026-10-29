"use client";
import useTransientNotice from '@/components/shared/useTransientNotice';
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { readCostInput, type CostPreview, type CostScope } from "@/lib/costs/cost-input";
import { ANALYTICS_CHANGED } from "@/lib/analytics/refresh-analytics-client";
import { ORDERS_CHANGED } from "@/lib/orders/refresh-orders-client";
export default function MissingCostsButton({ inventoryItemId, orderId, label = "თვითღირებულებების შევსება" }: CostScope & {
    label?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<CostPreview | null>(null), [values, setValues] = useState<Record<string, string>>({});
    const [error, setError] = useState(""), [message, setMessage] = useState("");
    useTransientNotice(message, setMessage);
    const [stock, setStock] = useState(true), [historical, setHistorical] = useState(!inventoryItemId);
    const [reloadCount, setReloadCount] = useState(0);
    const [invalidFields, setInvalidFields] = useState<string[]>([]);
    const [confirmed, setConfirmed] = useState(false), [review, setReview] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const pending = useRef(false);
    const displayDate = (value: string | null) => value ? new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10).split("-").reverse().join(".") : "";
    const field = "mt-2 h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary";
    useEffect(() => {
        if (!open)
            return;
        const d = dialog.current;
        d?.showModal();
        const controller = new AbortController();
        const params = new URLSearchParams();
        if (inventoryItemId)
            params.set("inventoryItemId", inventoryItemId);
        if (orderId)
            params.set("orderId", orderId);
        fetch(`/api/costs?${params}`, {
            cache: "no-store",
            signal: controller.signal
        }).then(async (response) => {
            const result = (await response.json()) as {
                success?: boolean;
                message?: string;
                data: CostPreview;
            };
            if (!response.ok || !result.success)
                throw new Error(result.message || "სია ვერ ჩაიტვირთა.");
            if (!controller.signal.aborted)
                setPreview(result.data);
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [open, inventoryItemId, orderId, reloadCount]);
    const rows = preview?.rows.filter(r => r.kind === "stock" ? stock : historical) ?? [];
    const entries = rows.filter(r => values[r.key]?.trim() !== "" && values[r.key] !== undefined).map(r => ({
        key: r.key,
        unitCost: values[r.key]
    }));
    function close() {
        if (pending.current)
            return;
        dialog.current?.close();
        setOpen(false);
    }
    async function save() {
        if (pending.current || !confirmed || !preview)
            return;
        pending.current = true;
        setSaving(true);
        setError("");
        try {
            const response = await fetch("/api/costs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inventoryItemId,
                    orderId,
                    token: preview.token,
                    entries,
                    confirmed: true
                })
            });
            const result = (await response.json()) as {
                success?: boolean;
                message?: string;
                data: {
                    stockProducts: number;
                    orderLines: number;
                };
            };
            if (!response.ok || !result.success)
                throw new Error(result.message || "შენახვა ვერ დადასტურდა.");
            setMessage(`შენახულია: ${result.data.stockProducts} მარაგის პროდუქტი და ${result.data.orderLines} შეკვეთის პროდუქტი.`);
            pending.current = false;
            close();
            const analyticsHandled = !window.dispatchEvent(new Event(ANALYTICS_CHANGED, {
                cancelable: true
            }));
            const ordersHandled = !window.dispatchEvent(new Event(ORDERS_CHANGED, {
                cancelable: true
            }));
            if (!analyticsHandled && !ordersHandled)
                router.refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "შენახვა ვერ დადასტურდა.");
        }
        finally {
            pending.current = false;
            setSaving(false);
        }
    }
    return <>
        <button type="button" onClick={() => {
            setMessage("");
            setLoading(true);
            setError("");
            setPreview(null);
            setValues({});
            setInvalidFields([]);
            setReview(false);
            setConfirmed(false);
            setOpen(true);
        }} className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"><Icon icon="solar:calculator-linear" className="size-5 shrink-0 text-accent"/>{label}</button>
        {message && <p role="status" className="mt-2 text-sm text-success">{message}</p>}
        <dialog ref={dialog} onCancel={event => {
            event.preventDefault();
            event.stopPropagation();
            close();
        }} onClose={event => {
            event.stopPropagation();
            if (!event.currentTarget.open && !pending.current)
                setOpen(false);
        }} onClick={event => {
            event.stopPropagation();
            if (event.target === event.currentTarget)
                close();
        }} aria-labelledby={`cost-title-${inventoryItemId ?? orderId ?? "all"}`} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] min-w-0 max-w-2xl overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-text-primary shadow-2xl backdrop:bg-black/35 backdrop:backdrop-blur-sm sm:p-6">
            <div className="flex min-w-0 items-center justify-between gap-3"><h2 id={`cost-title-${inventoryItemId ?? orderId ?? "all"}`} className="text-lg font-semibold">თვითღირებულება</h2><button type="button" aria-label="დახურვა" disabled={saving} onClick={close} className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border"><Icon icon="solar:close-circle-linear" className="size-6"/></button></div>
            <p className="mt-3 text-sm text-text-secondary">შეიყვანე ერთი ერთეულის ღირებულება. ცარიელი ველი უცნობად დარჩება; 0 ნიშნავს, რომ ხარჯი ნამდვილად არ გქონია. უკვე შევსებული თვითღირებულებები არ შეიცვლება.</p>
            {loading ? <p role="status" className="py-8 text-center">იტვირთება…</p> : preview && <>
                {!review && <>
                    <fieldset disabled={saving} className="mt-4 flex flex-wrap gap-4 text-sm">
                        {!orderId && <label className="flex items-center gap-2"><input type="checkbox" checked={stock} onChange={e => setStock(e.target.checked)}/>დარჩენილი მარაგი</label>}
                        <label className="flex items-center gap-2"><input type="checkbox" checked={historical} onChange={e => setHistorical(e.target.checked)}/>ძველი შეკვეთებიც</label>
                    </fieldset>
                    {inventoryItemId && historical && <p className="mt-3 text-xs text-warning">ქვემოთ ჩანს იმავე დასახელების, ფერისა და ზომის შეკვეთის პროდუქტები. თითოეული გადაამოწმე - მარაგში შეყვანილი ფასი მათ ავტომატურად არ მიენიჭება.</p>}
                    <div className="mt-4 space-y-3">{rows.map(row => <label key={row.key} className="block min-w-0 rounded-xl border border-border p-3"><span className="block break-words text-sm font-medium">{row.name}</span><span className="mt-1 block text-xs text-text-secondary">{row.kind === "stock" ? "დარჩენილი მარაგი" : `შეკვეთა #${row.orderNumber ?? "-"} · ${displayDate(row.date)}`} · {row.quantity} ერთეული</span><input aria-label={`${row.name} - ერთეულის თვითღირებულება`} inputMode="decimal" type="text" placeholder="არ არის მითითებული" value={values[row.key] ?? ""} aria-invalid={invalidFields.includes(row.key)} onChange={e => {
                        setInvalidFields(fields => fields.filter(key => key !== row.key));
                        setValues(v => ({...v, [row.key]: e.target.value}));
                    }} className={`${field} ${invalidFields.includes(row.key) ? "border-danger" : ""}`}/></label>)}</div>
                    {!rows.length && <p className="py-6 text-sm text-text-secondary">არჩეულ ნაწილში შესავსები თვითღირებულება არ არის.</p>}
                    {preview.hasMore && <p className="mt-3 text-xs text-text-secondary">სია ნაწილობრივაა ნაჩვენები. შენახვის შემდეგ ხელახლა გახსენი დარჩენილი ჩანაწერებისთვის.</p>}
                    <button type="button" disabled={!entries.length} onClick={() => {
                    try {
                        readCostInput({
                            inventoryItemId,
                            orderId,
                            token: preview.token,
                            confirmed: true,
                            entries
                        });
                        setError("");
                        setReview(true);
                    }
                    catch (e) {
                        setInvalidFields(entries.filter(entry => !/^\d{1,10}(\.\d{1,2})?$/.test(entry.unitCost.trim().replace(",", "."))).map(entry => entry.key));
                        setError(e instanceof Error ? e.message : "მონაცემები არასწორია.");
                    }
                }} className="mt-5 min-h-11 w-full rounded-xl bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">გადამოწმება ({entries.length})</button>
                </>}
                {review && <div className="mt-4 space-y-3">
                    <p className="text-sm">შეიცვლება მხოლოდ ქვემოთ ჩამოთვლილი თვითღირებულებები. მარაგის რაოდენობა და გადახდები უცვლელი დარჩება.</p>
                    {entries.map(entry => {
                    const row = rows.find(r => r.key === entry.key)!;
                    return <div key={entry.key} className="min-w-0 rounded-xl border border-border p-3 text-sm"><p className="break-words font-medium">{row.name}</p><p className="mt-1 text-text-secondary">{row.kind === "stock" ? "მარაგი" : `შეკვეთა #${row.orderNumber ?? "-"}`} · {row.quantity} × {entry.unitCost} ₾</p></div>;
                })}
                    <label className="flex items-start gap-2 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={confirmed} disabled={saving} onChange={e => setConfirmed(e.target.checked)}/><span>ვადასტურებ ამ ღირებულებების გამოყენებას არჩეულ მარაგსა და ისტორიულ გაყიდვებზე, მათი შესაბამისი დაბრუნებების გათვალისწინებით.</span></label>
                    <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => {
                    setReview(false);
                    setConfirmed(false);
                }} className="min-h-11 rounded-xl border border-border px-4">უკან</button><button type="button" disabled={!confirmed || saving} onClick={() => void save()} className="min-h-11 flex-1 rounded-xl bg-success px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "ინახება…" : "თვითღირებულებების შენახვა"}</button></div>
                </div>}
            </>}
            {error && <div className="mt-4 space-y-2"><p role="alert" className="break-words text-sm text-danger">{error}</p><button type="button" disabled={saving || loading} className="min-h-10 rounded-xl border border-border px-3 text-sm" onClick={() => {setLoading(true);setError("");setReview(false);setConfirmed(false);setReloadCount(n => n + 1);}}>სიის განახლება</button></div>}
        </dialog>
    </>;
}
