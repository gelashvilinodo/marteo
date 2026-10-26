import Pulse from '@/components/shared/SkeletonPulse';
export default function MaterialInventoryListSkeleton() {
    return <div role="status" aria-label="მასალების მარაგი იტვირთება"><span className="sr-only">მასალების მარაგი იტვირთება…</span><div aria-hidden="true" className="divide-y divide-border">{[0,1,2,3].map(index=><div key={index} className="min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 gap-3"><Pulse className="h-14 w-14 shrink-0 rounded-xl"/><div className="min-w-0 flex-1"><Pulse className="h-5 w-44"/><Pulse className="mt-1 h-4 w-60"/><Pulse className="mt-2 h-4 w-28"/></div></div>
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">{[0,1,2].map(i=><div key={i} className="min-w-0"><Pulse className="h-4 w-36"/><Pulse className="mt-1 h-5 w-24"/></div>)}<div className="flex min-h-10 items-center justify-end"><Pulse className="h-5 w-20"/></div></div>
    </div>)}</div></div>;
}
