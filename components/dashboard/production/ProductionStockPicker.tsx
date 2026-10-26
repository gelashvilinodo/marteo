'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import ProductThumbnail from '@/components/shared/ProductThumbnail';
import type { ProductionOptions } from '@/lib/production/snapshot';
import { unit } from './format';

type Props = {
    kind: 'materials' | 'products';
    productionId?: string;
    selectedIds: string[];
    close: () => void;
    chooseMaterial: (material: ProductionOptions['materials'][number]) => void;
    chooseProduct: (product: ProductionOptions['products'][number]) => void;
};

export default function ProductionStockPicker({kind, productionId, selectedIds, close, chooseMaterial, chooseProduct}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closing = useRef(false);
    const titleId = useId();
    const [visible, setVisible] = useState(false);
    const [query, setQuery] = useState('');
    const [data, setData] = useState<ProductionOptions | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const element = dialog.current!;
        element.showModal();
        let second = 0;
        const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setVisible(true)); });
        return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); if (timer.current) clearTimeout(timer.current); element.close(); };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        const delay = setTimeout(async () => {
            try {
                const params = new URLSearchParams({q: query});
                if (productionId) params.set('id', productionId);
                const response = await fetch(`/api/production/options?${params}`, {cache:'no-store', signal:controller.signal});
                const result = await response.json() as ProductionOptions & {error?:string};
                if (!response.ok || !Array.isArray(result.materials) || !Array.isArray(result.products)) throw new Error(result.error || 'მარაგი ვერ ჩაიტვირთა.');
                if (!controller.signal.aborted) { setData(result); setError(''); }
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'კავშირი შეწყდა.');
            } finally { if (!controller.signal.aborted) setBusy(false); }
        }, query ? 250 : 0);
        return () => { clearTimeout(delay); controller.abort(); };
    }, [query, productionId, revision]);
    function dismiss(action = close) {
        if (closing.current) return;
        closing.current = true;
        setVisible(false);
        timer.current = setTimeout(action, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
    }
    // Editing also returns already-used materials; filter them locally so a search remains exact.
    const needle = query.trim().toLocaleLowerCase();
    const rows = (kind === 'materials' ? data?.materials : data?.products)?.filter(item =>
        [item.name, item.color, item.size].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle)
    ) ?? [];
    return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();event.stopPropagation();dismiss();}} onClose={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget)dismiss();}} className={`fixed inset-0 m-auto flex h-[min(640px,90dvh)] max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm transition-[opacity,transform] duration-200 motion-reduce:transition-none ${visible?'translate-y-0 scale-100 opacity-100':'translate-y-3 scale-[0.97] opacity-0'}`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4"><h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold sm:text-base"><Icon icon="solar:box-linear" className="h-5 w-5 shrink-0 text-success"/>{kind==='materials'?'მასალის არჩევა მარაგიდან':'პროდუქტის არჩევა მარაგიდან'}</h2><button type="button" onClick={()=>dismiss()} aria-label="დახურვა" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border"><Icon icon="solar:close-circle-linear" className="h-6 w-6"/></button></div>
        <div className="shrink-0 p-4"><label className="relative block"><span className="sr-only">მარაგის ძებნა</span><Icon icon="solar:magnifer-linear" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-text-secondary"/><input autoFocus type="search" value={query} onChange={event=>{setQuery(event.target.value);setBusy(true);setError('');}} placeholder="სახელი, ფერი ან ზომა" className="h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background pl-10 pr-3 text-[16px] outline-none focus:border-accent lg:text-sm"/></label></div>
        <div aria-busy={busy} inert={!visible} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4">
            {busy?<div role="status" aria-label="მარაგი იტვირთება" className="space-y-2"><span className="sr-only">მარაგი იტვირთება…</span>{Array.from({length:5},(_,index)=><div key={index} aria-hidden="true" className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3 motion-safe:animate-pulse"><div className="h-12 w-12 shrink-0 rounded-xl bg-border/50"/><div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-2/3 max-w-48 rounded bg-border/50"/><div className="h-2.5 w-1/2 max-w-32 rounded bg-border/35"/><div className="h-2.5 w-3/4 max-w-40 rounded bg-border/35"/></div><div className="h-9 w-16 shrink-0 rounded-xl bg-border/40 sm:w-24"/></div>)}</div>:error?<div role="alert" className="py-6 text-sm text-danger">{error}<button type="button" onClick={()=>{setBusy(true);setRevision(value=>value+1);}} className="ml-3 underline">ხელახლა ცდა</button></div>:rows.length?<div className="space-y-2">{rows.map(item=>{
                const material = 'currentStock' in item ? item : null;
                const selected = selectedIds.includes(item.id);
                const unavailable = material && Number(material.currentStock)<=0;
                return <article key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">{'imageUrl' in item&&item.imageUrl?<ProductThumbnail src={item.imageUrl} alt={item.name} width={48} height={48} className="h-full w-full object-cover"/>:<Icon icon={material?'solar:layers-linear':'solar:box-linear'} className="h-6 w-6 text-accent"/>}</div><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.name}</p><p className="mt-1 break-words text-xs text-text-secondary">{[item.color,item.size].filter(Boolean).join(' · ')||'—'}</p>{material&&<p className="mt-1 text-xs text-text-secondary">ხელმისაწვდომია: {material.currentStock} {unit(material.unit)}</p>}</div><button type="button" disabled={selected||!!unavailable} onClick={()=>dismiss(()=>{if('currentStock' in item)chooseMaterial(item);else chooseProduct(item);})} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-success/40 px-3 text-xs font-medium text-success disabled:opacity-40"><Icon icon={selected?'solar:check-circle-linear':'solar:add-circle-linear'} className="h-4 w-4"/>{selected?'დამატებულია':unavailable?'ამოწურულია':'არჩევა'}</button></article>;
            })}</div>:<p className="py-10 text-center text-sm text-text-secondary">{kind==='materials'?'ხელმისაწვდომი მასალა ვერ მოიძებნა.':'პროდუქტი ვერ მოიძებნა.'}</p>}
            {!busy&&!error&&(kind==='materials'?data?.materialsTruncated:data?.productsTruncated)&&<p className="pt-3 text-xs text-text-secondary">ნაჩვენებია პირველი 50 ჩანაწერი. სხვა ჩანაწერისთვის დააზუსტე ძებნა.</p>}
        </div>
    </dialog>;
}
