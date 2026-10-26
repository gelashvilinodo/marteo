import Pulse from '@/components/shared/SkeletonPulse';
import MaterialPurchasesListSkeleton from '@/components/dashboard/material-purchases/MaterialPurchasesListSkeleton';
export default function Loading() {
    return <main role="status" aria-busy="true" aria-label="მასალების შესყიდვები იტვირთება" className="min-w-0 p-4 sm:p-6 lg:p-8"><span className="sr-only">მასალების შესყიდვები იტვირთება…</span><div aria-hidden="true" className="mx-auto min-w-0 max-w-7xl">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><h1 className="text-2xl font-semibold text-text-primary">შესყიდვები <span className="text-base font-normal text-text-secondary">— მასალები</span></h1><Pulse className="h-11 w-full rounded-xl lg:w-40"/></div>
        <div className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface sm:mt-6"><div className="flex h-11 items-center justify-between px-4 sm:hidden"><Pulse className="h-4 w-36"/><Pulse className="h-4 w-4"/></div><div className="hidden p-4 sm:block"><div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"><div className="min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1"><Pulse className="h-4 w-12"/><Pulse className="h-11 w-full rounded-xl"/></div>{[0,1].map(i=><div key={i} className="min-w-0 space-y-1.5"><Pulse className="h-4 w-20"/><Pulse className="h-11 w-full rounded-xl"/></div>)}<Pulse className="h-11 w-full rounded-xl sm:col-span-2 xl:col-span-1 xl:w-24"/></div><div className="mt-3 flex h-9 items-center justify-end"><Pulse className="h-5 w-24"/></div></div></div>
        <Pulse className="mt-4 h-5 w-24"/><MaterialPurchasesListSkeleton/>
    </div></main>;
}
