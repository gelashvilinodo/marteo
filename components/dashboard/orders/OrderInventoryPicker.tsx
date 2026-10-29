"use client";

import { quantityLabel, qsub } from "@/lib/orders/quantity";
import { useBusinessMode } from "@/components/dashboard/business/BusinessModeContext";
import { hasBusinessFeature } from "@/lib/business/business-mode";
import ProductThumbnail from "@/components/shared/ProductThumbnail";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { InventoryOrderProduct, OrderFormItem } from "@/lib/orders/order-form";

type Page = { products: InventoryOrderProduct[]; currentPage: number; totalPages: number; totalProducts: number };
export default function OrderInventoryPicker({ close, choose, items }: { close: () => void; choose: (product: InventoryOrderProduct, condition: "GOOD" | "DEFECTIVE") => void; items: OrderFormItem[] }) {
    const allowMaterials=hasBusinessFeature(useBusinessMode(),"manufacturing");
    const dialog = useRef<HTMLDialogElement>(null);
    const [kind,setKind]=useState<"products"|"materials">("products");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<Page | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
    useEffect(() => {
        const controller = new AbortController(); let active = true;
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ q: query, page: String(page),kind });
                const response = await fetch(`/api/orders/inventory?${params}`, { cache: "no-store", signal: controller.signal });
                const result = await response.json() as Page & { success?: boolean; message?: string };
                if (!response.ok || !result.success) throw new Error(result.message || "მარაგი ვერ ჩაიტვირთა.");
                if (active) { setData(result); setError(""); }
            } catch (cause: unknown) { if (active && !(cause instanceof Error && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "კავშირი შეწყდა."); }
            finally { if (active) setBusy(false); }
        }, query ? 250 : 0);
        return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [query, page, revision,kind]);
    function available(product: InventoryOrderProduct, condition: "GOOD" | "DEFECTIVE") {
        const selected = items.filter(item => !item.isCarriedOver && (product.source==="MATERIAL"?item.source==="MATERIAL"&&item.materialId===product.id:item.inventoryItemId === product.id) && item.condition === condition).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        return Math.max(0, qsub(condition === "GOOD" ? product.goodStock : product.defectiveStock,selected));
    }
    return <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onClose={event => event.stopPropagation()} onClick={event => { if (event.currentTarget === event.target) close(); }} aria-labelledby="order-inventory-picker-title" className="fixed inset-0 m-auto flex max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4"><h2 id="order-inventory-picker-title" className="flex items-center gap-2 font-semibold"><Icon icon="solar:box-linear" className="h-5 w-5 text-success" />მარაგიდან არჩევა</h2><button type="button" onClick={close} aria-label="დახურვა" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border"><Icon icon="solar:close-circle-linear" className="h-6 w-6" /></button></div>
        <div className="shrink-0 p-4">{allowMaterials&&<div role="tablist" aria-label="მარაგის ტიპი" className="relative mb-3 grid h-10 grid-cols-2 rounded-xl border border-border bg-background p-1"><span aria-hidden="true" className={`absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-lg bg-accent/15 transition-transform duration-200 motion-reduce:transition-none ${kind==='materials'?'translate-x-full':'translate-x-0'}`}/>{([['products','პროდუქტები','solar:box-linear'],['materials','მასალები','solar:layers-linear']] as const).map(([id,label,icon])=><button key={id} type="button" role="tab" aria-selected={kind===id} onClick={()=>{if(kind===id)return;setKind(id);setPage(1);setQuery('');setData(null);setError('');setBusy(true);}} className={`relative z-10 flex min-w-0 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${kind===id?'text-accent':'text-text-secondary'}`}><Icon icon={icon} className="h-4 w-4 shrink-0"/>{label}</button>)}</div>}<label className="relative block"><span className="sr-only">{kind==="materials"?"მასალის ძებნა":"პროდუქტის ძებნა"}</span><Icon icon="solar:magnifer-linear" className="absolute left-3 top-3 h-5 w-5 text-text-secondary" /><input autoFocus value={query} onChange={event => { setQuery(event.target.value); setPage(1); setBusy(true); }} placeholder={kind==="materials"?"მასალის სახელი, ფერი ან ზომა":"სახელი, SKU, ფერი ან ზომა"} className="h-11 w-full min-w-0 rounded-xl border border-border bg-background pl-10 pr-3 text-[16px] outline-none focus:border-accent lg:text-sm" /></label></div>
        <div aria-busy={busy} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {busy ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-text-secondary"><Icon icon="solar:refresh-linear" className="h-5 w-5 animate-spin text-accent" />იტვირთება…</p> : error ? <div role="alert" className="py-6 text-sm text-danger">{error}<button type="button" onClick={() => { setBusy(true); setRevision(value => value + 1); }} className="ml-3 underline">ხელახლა ცდა</button></div> : data?.products.length ? <div className="space-y-2">{data.products.map(product => <article key={product.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">{product.imageUrl ? <ProductThumbnail src={product.imageUrl} alt={product.name} width={48} height={48} unoptimized className="h-full w-full object-cover" /> : <Icon icon="solar:box-linear" className="h-6 w-6 text-accent" />}</div>
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{product.name}</p><p className="mt-1 break-words text-xs text-text-secondary">{[product.sku, product.color, product.size].filter(Boolean).join(" · ")}</p><p className="mt-1 text-xs font-medium">{product.source==="MATERIAL"?"გასაყიდი ფასი მიუთითე შეკვეთაში":`${product.salePrice ?? "-"} ₾`}</p></div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <button type="button" disabled={available(product, "GOOD") <= 0} onClick={() => choose(product, "GOOD")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-success/40 px-3 text-xs font-medium text-success disabled:opacity-40"><Icon icon="solar:add-circle-linear" className="h-4 w-4" />{product.source==="MATERIAL"?`დამატება · ${quantityLabel(available(product,"GOOD"),product.unit)}`:`დაუზიანებელი · ${available(product,"GOOD")}`}</button>
                    {product.defectiveStock > 0 && <button type="button" disabled={available(product, "DEFECTIVE") < 1} onClick={() => choose(product, "DEFECTIVE")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-warning/40 px-3 text-xs text-warning"><Icon icon="solar:add-circle-linear" className="h-4 w-4" />წუნდებული · {available(product, "DEFECTIVE")}</button>}
                </div>
            </article>)}</div> : <p className="py-10 text-center text-sm text-text-secondary">{kind==="materials"?"ხელმისაწვდომი მასალა ვერ მოიძებნა.":"პროდუქტი ვერ მოიძებნა."}</p>}
        </div>
        {data && data.totalPages > 1 && <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border p-3"><button type="button" disabled={busy || data.currentPage === 1} aria-label="წინა გვერდი" onClick={() => { setPage(data.currentPage - 1); setBusy(true); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-accent disabled:opacity-30"><Icon icon="solar:alt-arrow-left-linear" className="h-5 w-5" /></button><span className="text-sm text-text-secondary">{data.currentPage} / {data.totalPages}</span><button type="button" disabled={busy || data.currentPage === data.totalPages} aria-label="შემდეგი გვერდი" onClick={() => { setPage(data.currentPage + 1); setBusy(true); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-accent disabled:opacity-30"><Icon icon="solar:alt-arrow-right-linear" className="h-5 w-5" /></button></div>}
    </dialog>;
}
