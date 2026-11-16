import { AdminSkeleton, Block, SkBack, SkHeader, SkList, SkPanel } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="3xl">
        <SkBack />
        <SkHeader title="სწრაფი პასუხები" subtitle="მზა ტექსტები დახმარების ჩატისთვის" />
        <SkPanel title="ახალი შაბლონი" className="mt-5"><Block className="h-11 rounded-xl" /><Block className="mt-3 h-24 rounded-xl" /></SkPanel>
        <SkList rows={4} avatar={false} />
    </AdminSkeleton>;
}
