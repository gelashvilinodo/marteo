import { AdminSkeleton, SkFilters, SkHeader, SkList } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="6xl">
        <SkHeader title="მომხმარებლები" subtitle="სულ 0 მომხმარებელი · ახლიდან ძველისკენ" action />
        <SkFilters selects={4} />
        <SkList rows={10} />
    </AdminSkeleton>;
}
