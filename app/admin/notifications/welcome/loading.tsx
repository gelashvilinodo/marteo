import { Title, AdminSkeleton, Block } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="6xl">
        <Block className="h-5 w-28" />
        <Title className="mt-2" size={15} />
        <div className="mt-6 max-w-2xl space-y-4 rounded-2xl border border-border bg-surface p-5">
            {[0, 1, 2].map(index => <div key={index}><Block className="h-4 w-24" /><Block className="mt-2 h-11 rounded-xl" /></div>)}
            <Block className="h-24 rounded-xl" />
            <Block className="h-11 w-40 rounded-xl" />
        </div>
    </AdminSkeleton>;
}
