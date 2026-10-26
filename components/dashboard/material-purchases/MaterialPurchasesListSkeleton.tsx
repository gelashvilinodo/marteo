import Pulse from '@/components/shared/SkeletonPulse';
export default function MaterialPurchasesListSkeleton() {
    return <div role="status" aria-label="მასალების პარტიები იტვირთება" className="mt-6 space-y-4"><span className="sr-only">მასალების პარტიები იტვირთება…</span><div aria-hidden="true" className="space-y-4">{[0,1,2].map(index=><div key={index} className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Pulse className="h-7 w-14"/><Pulse className="h-6 w-28"/><Pulse className="h-6 w-20"/></div><Pulse className="mt-2 h-4 w-24"/></div><div className="flex shrink-0 gap-1"><Pulse className="h-11 w-11 rounded-xl"/><Pulse className="h-11 w-11 rounded-xl"/></div></div>
        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 gap-2">{[0,1,2].map(i=><Pulse key={i} className="h-12 w-12 shrink-0 rounded-xl sm:h-14 sm:w-14"/>)}</div><div className="flex min-h-11 items-center"><Pulse className="h-5 w-32"/></div></div>
        <div className="mt-4 flex min-w-0 flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center"><Pulse className="h-5 w-40"/><div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:justify-end"><Pulse className="h-5 w-36"/><Pulse className="h-7 w-24"/></div></div>
    </div>)}</div></div>;
}
