import { AdminSkeleton, Block, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="5xl">
        <SkHeader title="ყურადღება" subtitle="ბიზნესები, რომლებსაც შეიძლება ჩვენგან წერილი ან დახმარება სჭირდებოდეს." />
        <div className="mt-5 flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map(index => <Block key={index} className="h-9 w-28 rounded-full" />)}</div>
        <SkList rows={6} />
    </AdminSkeleton>;
}
