import Pulse from '@/components/shared/SkeletonPulse';
import ProductionListSkeleton from '@/components/dashboard/production/ProductionListSkeleton';
export default function Loading() {
    return <main role="status" aria-busy="true" aria-label="წარმოება იტვირთება" className="min-w-0 p-4 sm:p-6 lg:p-8"><span className="sr-only">წარმოება იტვირთება…</span><div aria-hidden="true" className="mx-auto min-w-0 max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><h1 className="text-2xl font-semibold text-text-primary">წარმოება</h1><Pulse className="h-11 w-full rounded-xl sm:w-44"/></div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{[0,1,2].map(i=><div key={i} className={`min-w-0 rounded-2xl border border-border bg-surface p-4 ${i===0?'col-span-2 sm:col-span-1':''}`}><div className="flex items-center justify-between gap-2"><Pulse className="h-6 w-6"/><Pulse className="h-8 w-8"/></div><Pulse className="mt-3 h-5 w-32"/></div>)}</div>
        <div className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface sm:mt-6"><div className="flex h-11 items-center justify-between px-4 sm:hidden"><Pulse className="h-4 w-36"/><Pulse className="h-4 w-4"/></div><div className="hidden gap-3 p-4 sm:flex"><Pulse className="h-11 min-w-0 flex-1 rounded-xl"/><Pulse className="h-11 w-24 rounded-xl"/></div></div>
        <Pulse className="mt-4 h-5 w-24"/><ProductionListSkeleton/>
    </div></main>;
}
