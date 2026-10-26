import Pulse from '@/components/shared/SkeletonPulse';
export default function ProductionListSkeleton() {
    return <div role="status" aria-label="წარმოებების სია იტვირთება" className="mt-5 space-y-4"><span className="sr-only">წარმოებების სია იტვირთება…</span><div aria-hidden="true" className="space-y-4">{[0,1,2].map(index=><div key={index} className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Pulse className="h-7 w-14"/><Pulse className="h-6 w-32"/><Pulse className="h-6 w-20"/></div><Pulse className="mt-2 h-4 w-24"/></div><Pulse className="h-11 w-11 shrink-0 rounded-xl"/></div>
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">{[0,1,2].map(i=><div key={i} className={`min-w-0 ${i===2?'col-span-2 sm:col-span-1':''}`}><Pulse className="h-4 w-36"/><Pulse className={`mt-1 w-24 ${i===2?'h-7':'h-5'}`}/></div>)}</div>
        <div className="mt-4 border-t border-border pt-3"><div className="flex min-h-9 items-center justify-end"><Pulse className="h-5 w-36"/></div></div>
    </div>)}</div></div>;
}
