import Pulse from '@/components/shared/SkeletonPulse';
import MaterialInventoryListSkeleton from '@/components/dashboard/material-inventory/MaterialInventoryListSkeleton';
export default function Loading() {
    return <main role="status" aria-busy="true" aria-label="მასალების მარაგი იტვირთება" className="min-w-0 p-4 sm:p-6 lg:p-8"><span className="sr-only">მასალების მარაგი იტვირთება…</span><div aria-hidden="true" className="mx-auto min-w-0 max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold text-text-primary">მასალების მარაგი</h1><Pulse className="h-11 w-48 rounded-xl"/></div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">{[0,1,2,3,4].map(i=><div key={i} className={`min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4 ${i===4?'col-span-2 lg:col-span-1':''}`}><div className="flex items-center justify-between gap-2"><Pulse className="h-6 w-6"/><Pulse className="h-8 w-8"/></div><Pulse className="mt-3 h-4 w-28 sm:h-5"/></div>)}</div>
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-border bg-surface px-4 py-2.5"><Pulse className="h-5 w-36"/><Pulse className="h-4 w-4"/></div>
        <section className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface"><div className="flex items-center justify-between gap-3 border-b border-border p-4"><h2 className="text-sm font-semibold text-text-primary">მასალები</h2><Pulse className="h-9 w-9 rounded-lg"/></div><MaterialInventoryListSkeleton/></section>
    </div></main>;
}
